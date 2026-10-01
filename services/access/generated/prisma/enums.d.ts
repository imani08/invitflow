export declare const AgentStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly REVOKED: "REVOKED";
};
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];
export declare const AccessScanOutcome: {
    readonly ACCEPTED: "ACCEPTED";
    readonly DUPLICATE: "DUPLICATE";
    readonly REJECTED: "REJECTED";
    readonly UNAVAILABLE: "UNAVAILABLE";
};
export type AccessScanOutcome = (typeof AccessScanOutcome)[keyof typeof AccessScanOutcome];
