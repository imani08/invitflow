export const REPORT_RESOURCE_ID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

const reportResourceId = new RegExp(`^(?:${REPORT_RESOURCE_ID_PATTERN})$`, 'i');

export function isValidReportResourceId(value) {
  return reportResourceId.test(value);
}
