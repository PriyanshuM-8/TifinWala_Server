import {
  getOrderReport,
  getRevenueReport,
  getChefReport,
  getCustomerReport,
  getFoodReport,
  getSubscriptionReport,
  getPaymentReport,
  getCancellationReport,
} from "../Services/adminReportService.js";

export async function getOrderReportHandler(req, res, next) {
  try {
    const { startDate, endDate, groupBy } = req.query;
    const report = await getOrderReport({ startDate, endDate, groupBy });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

export async function getRevenueReportHandler(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const report = await getRevenueReport({ startDate, endDate });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

export async function getChefReportHandler(req, res, next) {
  try {
    const { startDate, endDate, limit } = req.query;
    const report = await getChefReport({ startDate, endDate, limit });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

export async function getCustomerReportHandler(req, res, next) {
  try {
    const { startDate, endDate, limit } = req.query;
    const report = await getCustomerReport({ startDate, endDate, limit });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

export async function getFoodReportHandler(req, res, next) {
  try {
    const { limit } = req.query;
    const report = await getFoodReport({ limit });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

export async function getSubscriptionReportHandler(req, res, next) {
  try {
    const report = await getSubscriptionReport();
    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

export async function getPaymentReportHandler(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const report = await getPaymentReport({ startDate, endDate });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

export async function getCancellationReportHandler(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const report = await getCancellationReport({ startDate, endDate });
    return res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}
