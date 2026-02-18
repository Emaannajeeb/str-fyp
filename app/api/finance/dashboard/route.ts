/**
 * Finance Dashboard Metrics API
 * GET: Get real-time dashboard metrics for finance dashboard
 * Permission: VIEW_FINANCE_DASHBOARD
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withAuthAndRBAC } from '@/lib/middleware/rbac-guard';
import { computeCommitted } from '@/server/finance/budget';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

async function getDashboardMetricsHandler(
  request: NextRequest,
  session: { userId: string; organizationId: string }
) {
  try {
    // Get all streams for the organization
    const streams = await db.stream.findMany({
      where: {
        organizationId: session.organizationId,
      },
      include: {
        contract: {
          select: {
            period: true,
            amountPerPeriod: true,
            tokenSymbol: true,
          },
        },
      },
    });

    const now = new Date();
    const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Calculate metrics
    const activeStreams = streams.filter(
      (s) => s.status === 'ACTIVE' && new Date(s.startTime) <= now && new Date(s.endTime) >= now
    );

    const pausedStreams = streams.filter((s) => s.status === 'PAUSED');

    const upcomingStarts = streams.filter(
      (s) =>
        s.status === 'PENDING' &&
        new Date(s.startTime) > now &&
        new Date(s.startTime) <= oneMonthFromNow
    );

    // Calculate monthly payout (sum of all active streams' monthly amounts)
    let monthlyPayout = 0;
    activeStreams.forEach((stream) => {
      const contract = stream.contract;
      if (!contract) return;

      let monthlyAmount = 0;
      if (contract.period === 'MONTHLY') {
        monthlyAmount = Number(contract.amountPerPeriod);
      } else if (contract.period === 'WEEKLY') {
        monthlyAmount = Number(contract.amountPerPeriod) * 4.33; // Average weeks per month
      } else if (contract.period === 'BIWEEKLY') {
        monthlyAmount = Number(contract.amountPerPeriod) * 2.17; // Average biweeks per month
      } else if (contract.period === 'DAILY') {
        monthlyAmount = Number(contract.amountPerPeriod) * 30; // Average days per month
      }

      monthlyPayout += monthlyAmount;
    });

    // Get budgets to calculate burn rate and cap
    const budgets = await db.budget.findMany({
      where: {
        organizationId: session.organizationId,
      },
    });

    // Calculate total committed (burn rate) and total cap
    let totalBurnRate = 0;
    let totalCapAmount = 0;

    for (const budget of budgets) {
      const committed = await computeCommitted(session.organizationId, budget.tokenMint);
      totalBurnRate += Number(committed);
      totalCapAmount += Number(budget.capAmount);
    }

    // Calculate burn rate data for the last 30 days
    // For now, we'll calculate based on stream creation dates and amounts
    // In a real implementation, you'd track daily spending
    const burnRateData: Array<{ date: string; amount: number }> = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = subDays(today, i);
      const dateStart = startOfDay(date);
      const dateEnd = endOfDay(date);

      // Calculate total amount of streams created on this day
      // This is a simplified calculation - in production, you'd track actual daily spending
      const streamsCreatedOnDay = streams.filter(
        (s) =>
          new Date(s.createdAt) >= dateStart &&
          new Date(s.createdAt) <= dateEnd &&
          s.status !== 'CANCELLED'
      );

      let dailyAmount = 0;
      streamsCreatedOnDay.forEach((stream) => {
        // Estimate daily spending based on stream total amount and duration
        const duration = (new Date(stream.endTime).getTime() - new Date(stream.startTime).getTime()) / (1000 * 60 * 60 * 24);
        if (duration > 0) {
          dailyAmount += Number(stream.totalAmount) / duration;
        }
      });

      // Also add ongoing streams' daily rate
      const activeStreamsOnDay = streams.filter(
        (s) =>
          s.status === 'ACTIVE' &&
          new Date(s.startTime) <= dateEnd &&
          new Date(s.endTime) >= dateStart
      );

      activeStreamsOnDay.forEach((stream) => {
        const duration = (new Date(stream.endTime).getTime() - new Date(stream.startTime).getTime()) / (1000 * 60 * 60 * 24);
        if (duration > 0) {
          dailyAmount += Number(stream.totalAmount) / duration;
        }
      });

      burnRateData.push({
        date: format(date, 'MMM d'),
        amount: dailyAmount,
      });
    }

    return NextResponse.json({
      success: true,
      metrics: {
        activeStreams: activeStreams.length,
        monthlyPayout: monthlyPayout.toFixed(2),
        pausedStreams: pausedStreams.length,
        upcomingStarts: upcomingStarts.length,
        burnRate: totalBurnRate.toFixed(2),
        capAmount: totalCapAmount.toFixed(2),
      },
      burnRateData,
    });
  } catch (error) {
    console.error('Get dashboard metrics error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuthAndRBAC(getDashboardMetricsHandler, {
  requiredPermissions: ['VIEW_FINANCE_DASHBOARD'],
});

