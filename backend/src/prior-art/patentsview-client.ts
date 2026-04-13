/**
 * Shared patent result type used as the DTO between ODP client, prior-art
 * service, and scoring. Named PatentsViewPatent for historical reasons
 * (originally from the PatentsView API, now sourced from USPTO ODP).
 */
export interface PatentsViewPatent {
  patent_id: string;
  patent_title: string;
  patent_abstract: string | null;
  patent_date: string | null;
  patent_type: string | null;
}

let _apiKey: string = '';

/** Set the USPTO API key for authenticated requests (used by ODP client). */
export function setPatentSearchApiKey(key: string): void {
  _apiKey = key;
}

/** Get the current API key. */
export function getPatentSearchApiKey(): string {
  return _apiKey;
}
