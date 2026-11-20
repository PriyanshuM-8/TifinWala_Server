import { getTreasuryOverview } from "../Services/adminTreasuryService.js";

/**
 * GET /api/admin/treasury/overview
 * Returns reconciled treasury cash vs accounting revenue, liabilities breakdown, and withdrawable balance.
 */
export async function getTreasuryOverviewHandler(req, res, next) {
  try {
    const overview = await getTreasuryOverview();
    return res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
}
