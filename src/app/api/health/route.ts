import { NextResponse } from 'next/server';
import { BUILD_INFO } from '@/lib/build-info';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Izzie2',
    version: BUILD_INFO.version,
    build: {
      gitHash: BUILD_INFO.gitHash,
      gitBranch: BUILD_INFO.gitBranch,
      buildTime: BUILD_INFO.buildTime,
      nodeVersion: BUILD_INFO.nodeVersion,
      isDirty: BUILD_INFO.isDirty,
    },
  });
}
