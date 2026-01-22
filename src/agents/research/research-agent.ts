/**
 * Research Agent
 * Deep research agent with multi-source search (web, email, drive) and synthesis
 */

import { BaseAgent } from '@/agents/base/agent';
import type { AgentContext, AgentResult } from '@/agents/base/types';
import { webSearch, batchFetchAndCache } from '@/lib/search';
import { getServiceAccountAuth } from '@/lib/google/auth';
import { planResearch, getPlanProgress } from './planner';
import { analyzeSources, rankSources } from './analyzer';
import { synthesize, generateCitations, calculateQualityScore } from './synthesizer';
import { saveResearchSources, saveResearchFindings } from '@/lib/db/research';
import { saveFindings } from '@/lib/weaviate/research-findings';
import { searchEmails } from './sources/email-source';
import { searchDriveFiles } from './sources/drive-source';
import type {
  ResearchInput,
  ResearchOutput,
  ResearchSubTask,
  ResearchSourceSummary,
  ResearchSource,
  ResearchSourceResult,
} from './types';

export class ResearchAgent extends BaseAgent<ResearchInput, ResearchOutput> {
  constructor() {
    super({
      name: 'research',
      description: 'Deep research agent with multi-source search (web, email, drive) and synthesis',
      version: '1.1.0',
      maxBudget: 0.5, // $0.50 default limit
      maxDuration: 300000, // 5 minutes
      retryConfig: {
        maxRetries: 2,
        backoffMs: 2000,
      },
    });
  }

  /**
   * Execute research task
   */
  async execute(
    input: ResearchInput,
    context: AgentContext
  ): Promise<AgentResult<ResearchOutput>> {
    const startTime = Date.now();
    const {
      query,
      context: userContext,
      maxSources = 10,
      excludeDomains = [],
      sources = ['web'],
    } = input;

    try {
      // Step 1: Plan research (10% progress)
      await context.updateProgress({
        progress: 10,
        currentStep: 'Planning research',
      });
      const plan = await planResearch(query, userContext, {
        maxSubTasks: Math.min(5, Math.ceil(maxSources / 2)),
      });

      console.log(
        `[ResearchAgent] Plan: ${plan.subTasks.length} sub-tasks, sources: [${sources.join(', ')}], estimated cost: $${plan.estimatedCost.toFixed(4)}`
      );

      // Check if cancelled
      if (await context.isCancelled()) {
        throw new Error('Task cancelled during planning');
      }

      // Step 2: Execute searches across all sources (10-40% progress)
      await context.updateProgress({
        progress: 15,
        currentStep: `Searching ${sources.length} source(s): ${sources.join(', ')}`,
      });

      // Calculate results per source
      const resultsPerSource = Math.ceil(maxSources / sources.length);
      const allSourceResults: ResearchSourceResult[] = [];

      // Search all sources in parallel
      const sourceSearchPromises = await this.searchAllSources(
        query,
        sources,
        resultsPerSource,
        context.userId
      );
      allSourceResults.push(...sourceSearchPromises);

      console.log(
        `[ResearchAgent] Found ${allSourceResults.length} results across all sources`
      );

      await context.updateProgress({
        progress: 25,
        currentStep: 'Executing web searches',
      });

      // Execute web searches for sub-tasks (only if web is in sources)
      let webFetchResults: Array<{
        url: string;
        title?: string;
        content: string;
        contentType: string;
        fetchedAt: Date;
        error?: string;
      }> = [];

      if (sources.includes('web')) {
        const searchResults = await this.executeSearches(plan.subTasks, {
          maxResults: Math.ceil(resultsPerSource / plan.subTasks.length),
          excludeDomains,
        });

        // Update plan with results
        plan.subTasks.forEach((task, i) => {
          task.results = searchResults[i] || [];
          task.status = task.results.length > 0 ? 'completed' : 'failed';
        });

        const planProgress = getPlanProgress(plan);
        console.log(
          `[ResearchAgent] Web searches complete: ${planProgress.completed}/${planProgress.total} successful`
        );

        await context.updateProgress({
          progress: 40,
          currentStep: 'Fetching web content',
        });

        // Collect all unique URLs from web search
        const allWebResults = plan.subTasks.flatMap((t) => t.results || []);
        const uniqueUrls = Array.from(new Set(allWebResults.map((r) => r.url))).slice(
          0,
          resultsPerSource
        );

        console.log(`[ResearchAgent] Fetching ${uniqueUrls.length} unique web URLs`);

        // Fetch web content
        if (uniqueUrls.length > 0) {
          const fetchResults = await batchFetchAndCache(context.task.id, uniqueUrls, {
            concurrency: 5,
            timeout: 30000,
          });

          // Filter successful fetches
          webFetchResults = fetchResults.filter(
            (f) => !f.error && f.content.length > 100
          );

          console.log(
            `[ResearchAgent] Fetched ${webFetchResults.length}/${uniqueUrls.length} web sources successfully`
          );
        }
      }

      await context.updateProgress({
        progress: 50,
        currentStep: 'Preparing content for analysis',
      });

      // Build content for analysis from all sources
      const contentForAnalysis = this.buildContentForAnalysis(
        webFetchResults,
        allSourceResults
      );

      if (contentForAnalysis.length === 0) {
        throw new Error('Failed to fetch any content from any source');
      }

      await context.updateProgress({
        progress: 60,
        currentStep: 'Analyzing sources',
      });

      // Step 4: Analyze sources (60-80% progress)
      const analyses = await analyzeSources(contentForAnalysis, query, { concurrency: 3 });

      // Rank and filter sources
      const rankedSources = rankSources(analyses);

      console.log(
        `[ResearchAgent] Analyzed ${rankedSources.length} sources, found ${rankedSources.reduce((sum, s) => sum + s.findings.length, 0)} total findings`
      );

      await context.updateProgress({
        progress: 80,
        currentStep: 'Synthesizing findings',
      });

      // Step 5: Synthesize findings (80-100% progress)
      const allFindings = rankedSources.flatMap((s) => s.findings);
      const sourceSummaries: ResearchSourceSummary[] = rankedSources.map((s) => ({
        url: s.url,
        title: this.findSourceTitle(s.url, webFetchResults, allSourceResults),
        relevance: s.relevance,
        credibility: s.credibility,
        keyPoints: s.keyPoints,
      }));

      const synthesis = await synthesize(allFindings, sourceSummaries, query);

      // Calculate quality score
      const quality = calculateQualityScore(allFindings, sourceSummaries);

      console.log(
        `[ResearchAgent] Research complete - Quality score: ${quality.score.toFixed(2)}`
      );

      await context.updateProgress({
        progress: 90,
        currentStep: 'Saving results',
      });

      // Step 6: Save sources and findings to database and Weaviate
      try {
        // Save web sources to PostgreSQL (email/drive sources tracked separately)
        if (webFetchResults.length > 0) {
          await saveResearchSources(
            webFetchResults.map((f) => ({
              taskId: context.task.id,
              url: f.url,
              title: f.title,
              content: f.content,
              contentType: 'html',
              relevanceScore:
                rankedSources.find((s) => s.url === f.url)?.relevance || 0,
              credibilityScore:
                rankedSources.find((s) => s.url === f.url)?.credibility || 0,
              fetchStatus: 'fetched' as const,
              fetchedAt: new Date(),
            }))
          );
        }

        // Save findings to both PostgreSQL and Weaviate
        if (synthesis.topFindings.length > 0) {
          // PostgreSQL
          await saveResearchFindings(
            synthesis.topFindings.map((f) => ({
              taskId: context.task.id,
              claim: f.claim,
              evidence: f.evidence,
              confidence: f.confidence,
              quote: f.quote,
            }))
          );

          // Weaviate (for semantic search)
          await saveFindings(
            synthesis.topFindings,
            context.task.id,
            context.userId
          );
        }

        console.log(
          `[ResearchAgent] Saved ${webFetchResults.length} web sources and ${synthesis.topFindings.length} findings`
        );
      } catch (error) {
        console.error('[ResearchAgent] Failed to save results:', error);
        // Continue anyway - results are still in output
      }

      await context.updateProgress({
        progress: 100,
        currentStep: 'Complete',
      });

      // Calculate total cost and tokens
      const totalCost = context.task.totalCost;
      const totalTokens = context.task.tokensUsed;

      const output: ResearchOutput = {
        summary: synthesis.summary,
        findings: synthesis.topFindings,
        sources: sourceSummaries,
        totalTokens,
        totalCost,
      };

      const duration = Date.now() - startTime;
      console.log(
        `[ResearchAgent] Task complete in ${(duration / 1000).toFixed(1)}s, cost: $${totalCost.toFixed(4)}`
      );

      return {
        success: true,
        data: output,
        tokensUsed: totalTokens,
        totalCost,
      };
    } catch (error) {
      console.error('[ResearchAgent] Task failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: context.task.tokensUsed,
        totalCost: context.task.totalCost,
      };
    }
  }

  /**
   * Search all configured sources in parallel
   */
  private async searchAllSources(
    query: string,
    sources: ResearchSource[],
    maxResultsPerSource: number,
    userId: string
  ): Promise<ResearchSourceResult[]> {
    const results: ResearchSourceResult[] = [];

    // Get auth for Google services if needed
    let auth: Awaited<ReturnType<typeof getServiceAccountAuth>> | null = null;
    if (sources.includes('email') || sources.includes('drive')) {
      try {
        auth = await getServiceAccountAuth(userId);
      } catch (error) {
        console.error('[ResearchAgent] Failed to get Google auth:', error);
        // Continue without email/drive sources
      }
    }

    const searchPromises: Promise<ResearchSourceResult[]>[] = [];

    // Search emails
    if (sources.includes('email') && auth) {
      searchPromises.push(
        searchEmails(auth, query, { maxResults: maxResultsPerSource })
          .catch((error) => {
            console.error('[ResearchAgent] Email search failed:', error);
            return [];
          })
      );
    }

    // Search Drive
    if (sources.includes('drive') && auth) {
      searchPromises.push(
        searchDriveFiles(auth, query, { maxResults: maxResultsPerSource })
          .catch((error) => {
            console.error('[ResearchAgent] Drive search failed:', error);
            return [];
          })
      );
    }

    // Execute all searches in parallel
    const searchResults = await Promise.all(searchPromises);
    searchResults.forEach((sourceResults) => {
      results.push(...sourceResults);
    });

    return results;
  }

  /**
   * Build content array for analysis from all sources
   */
  private buildContentForAnalysis(
    webFetches: Array<{
      url: string;
      title?: string;
      content: string;
    }>,
    sourceResults: ResearchSourceResult[]
  ): Array<{ content: string; url: string; title?: string }> {
    const content: Array<{ content: string; url: string; title?: string }> = [];

    // Add web content
    for (const fetch of webFetches) {
      content.push({
        content: fetch.content,
        url: fetch.url,
        title: fetch.title,
      });
    }

    // Add email/drive content (use snippet as content for analysis)
    for (const result of sourceResults) {
      content.push({
        content: `[${result.sourceType.toUpperCase()}] ${result.reference}\n\n${result.snippet}`,
        url: `${result.sourceType}://${result.link}`,
        title: result.title,
      });
    }

    return content;
  }

  /**
   * Find title for a source URL
   */
  private findSourceTitle(
    url: string,
    webFetches: Array<{ url: string; title?: string }>,
    sourceResults: ResearchSourceResult[]
  ): string {
    // Check web fetches
    const webMatch = webFetches.find((f) => f.url === url);
    if (webMatch?.title) return webMatch.title;

    // Check email/drive results
    const sourceMatch = sourceResults.find(
      (r) => `${r.sourceType}://${r.link}` === url
    );
    if (sourceMatch) return sourceMatch.title;

    return 'Untitled';
  }

  /**
   * Execute searches for sub-tasks
   */
  private async executeSearches(
    subTasks: ResearchSubTask[],
    options: { maxResults: number; excludeDomains: string[] }
  ): Promise<Array<any[]>> {
    const results = await Promise.all(
      subTasks.map(async (task) => {
        try {
          console.log(`[ResearchAgent] Searching: "${task.query}"`);
          const searchResults = await webSearch(task.query, {
            maxResults: options.maxResults,
          });

          // Filter excluded domains
          const filtered = searchResults.filter(
            (r) =>
              !options.excludeDomains.some((domain) => r.url.includes(domain))
          );

          return filtered;
        } catch (error) {
          console.error(`[ResearchAgent] Search failed for "${task.query}":`, error);
          return [];
        }
      })
    );

    return results;
  }

  /**
   * Validate research input
   */
  protected async validateInput(input: ResearchInput): Promise<boolean> {
    if (!input.query || input.query.trim().length === 0) {
      console.error('[ResearchAgent] Invalid input: query is required');
      return false;
    }

    if (input.query.length > 500) {
      console.error('[ResearchAgent] Invalid input: query too long (max 500 chars)');
      return false;
    }

    return true;
  }
}
