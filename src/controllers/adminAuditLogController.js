import {
  listAuditLogs,
  getAuditLogById,
} from "../Services/auditLogService.js";

/**
 * GET /api/admin/audit-logs
 */
export async function listAuditLogsHandler(req, res, next) {
  try {
    const {
      actionType,
      targetEntityType,
      targetEntityId,
      adminId,
      startDate,
      endDate,
      page,
      limit,
    } = req.query;

    const result = await listAuditLogs({
      actionType,
      targetEntityType,
      targetEntityId,
      adminId,
      startDate,
      endDate,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/audit-logs/:logId
 */
export async function getAuditLogByIdHandler(req, res, next) {
  try {
    const log = await getAuditLogById(req.params.logId);
    return res.status(200).json({
      success: true,
      log,
    });
  } catch (error) {
    next(error);
  }
}
