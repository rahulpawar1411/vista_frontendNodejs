/**
 * WHAT: Re-exports the customer secure window under an alternate path.
 * WHY: Older imports may use SubAdminWindow folder name.
 * HOW: Single re-export — no extra logic.
 */
export { default } from '../SubAdminSecureWindow/SubAdminSecureWindow';
