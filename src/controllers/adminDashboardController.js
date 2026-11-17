import { getDashboardOverview } from "../Services/adminDashboardService.js";

/**
 * GET /api/admin/dashboard/overview
 */
export async function getDashboardOverviewHandler(req, res, next) {
  try {
    const { period, startDate, endDate } = req.query;
    const overview = await getDashboardOverview({ period, startDate, endDate });

    return res.status(200).json({
      success: true,
      ...overview,
    });
  } catch (error) {
    next(error);
  }
}
