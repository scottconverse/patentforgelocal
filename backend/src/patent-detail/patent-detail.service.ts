import { Injectable, NotFoundException } from '@nestjs/common';
import { PatentDetail } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { fetchEnrichedPatent } from './patentsview-enrichment';
import { fetchEnrichedPatentODP } from './odp-enrichment';
import { fetchClaimsFromODP } from './odp-claims';
import { fetchPatentFamilyODP, PatentFamilyMember } from './odp-continuity';

export interface FormattedPatentDetail {
  patentNumber: string;
  title: string | null;
  abstract: string | null;
  filingDate: string | null;
  grantDate: string | null;
  assignee: unknown[];
  inventors: unknown[];
  cpcClassifications: unknown[];
  claimsText: string | null;
  claimCount: number | null;
  patentType: string | null;
}

const CACHE_TTL_DAYS = 30;

@Injectable()
export class PatentDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Get enriched detail for a patent. Checks local cache first (30-day TTL),
   * then fetches from PatentsView if stale or missing.
   */
  async getDetail(patentNumber: string) {
    // Check cache
    const cached = await this.prisma.patentDetail.findUnique({
      where: { patentNumber },
    });

    if (cached && !this.isStale(cached.fetchedAt)) {
      return this.formatResponse(cached);
    }

    // Fetch from ODP (preferred) or PatentsView (legacy fallback)
    const settings = await this.settingsService.getSettings();
    let enriched;
    if (settings.usptoApiKey) {
      enriched = await fetchEnrichedPatentODP(patentNumber, settings.usptoApiKey);
    } else {
      enriched = await fetchEnrichedPatent(patentNumber);
    }
    if (!enriched) {
      if (cached) return this.formatResponse(cached); // stale cache is better than nothing
      const msg = settings.usptoApiKey
        ? `Patent ${patentNumber} not found in USPTO Open Data Portal`
        : 'Patent detail requires a USPTO API key. Add one in Settings, or view this patent on Google Patents.';
      throw new NotFoundException(msg);
    }

    // Upsert into cache
    const data = {
      patentNumber,
      title: enriched.title,
      abstract: enriched.abstract,
      filingDate: enriched.filingDate,
      grantDate: enriched.grantDate,
      assignee: JSON.stringify(enriched.assignees),
      inventors: JSON.stringify(enriched.inventors),
      cpcClassifications: JSON.stringify(enriched.cpcClassifications),
      claimsText: enriched.claims.map((c) => `${c.number}. ${c.text}`).join('\n\n'),
      claimCount: enriched.claimCount,
      patentType: enriched.patentType,
      fetchedAt: new Date(),
    };

    const detail = await this.prisma.patentDetail.upsert({
      where: { patentNumber },
      create: { ...data },
      update: { ...data },
    });

    return this.formatResponse(detail);
  }

  /**
   * Get just the claims text for a patent (lazy-loaded by frontend).
   * Tries cache first, then fetches from ODP Documents API if a
   * USPTO API key is configured. Without a key, returns null claims.
   */
  async getClaims(patentNumber: string) {
    // Try cache first
    const cached = await this.prisma.patentDetail.findUnique({
      where: { patentNumber },
      select: { claimsText: true, claimCount: true },
    });

    if (cached?.claimsText) {
      return { claimsText: cached.claimsText, claimCount: cached.claimCount };
    }

    // Fetch from ODP Documents API if key is available
    const settings = await this.settingsService.getSettings();
    if (settings.usptoApiKey) {
      const result = await fetchClaimsFromODP(patentNumber, settings.usptoApiKey);
      if (result) {
        // Cache the claims for future requests
        await this.prisma.patentDetail.updateMany({
          where: { patentNumber },
          data: {
            claimsText: result.claimsText,
            claimCount: result.claimCount,
          },
        });
        return { claimsText: result.claimsText, claimCount: result.claimCount };
      }
    }

    // No key or fetch failed — return null claims
    return { claimsText: null, claimCount: null };
  }

  /**
   * Batch-fetch details for CSV export. Fetches missing ones from PatentsView.
   */
  async enrichBatch(patentNumbers: string[]): Promise<Map<string, FormattedPatentDetail>> {
    const result = new Map<string, FormattedPatentDetail>();

    // Load all cached
    const cached = await this.prisma.patentDetail.findMany({
      where: { patentNumber: { in: patentNumbers } },
    });

    for (const c of cached) {
      result.set(c.patentNumber, this.formatResponse(c));
    }

    // Fetch any missing (but don't block CSV on failed fetches)
    const missing = patentNumbers.filter((pn) => !result.has(pn));
    for (const pn of missing) {
      try {
        const detail = await this.getDetail(pn);
        result.set(pn, detail);
      } catch {
        // Leave as unresolved — CSV will have empty columns
      }
    }

    return result;
  }

  /**
   * Get patent family (continuity) data for a patent.
   * Checks local cache first (30-day TTL), then fetches from ODP.
   */
  async getFamily(patentNumber: string): Promise<PatentFamilyMember[]> {
    // Check cache
    const cached = await this.prisma.patentFamily.findUnique({
      where: { patentNumber },
    });

    if (cached && !this.isStale(cached.fetchedAt)) {
      return this.parseJsonArray<PatentFamilyMember>(cached.members);
    }

    // Fetch from ODP
    const settings = await this.settingsService.getSettings();
    if (!settings.usptoApiKey) {
      return [];
    }

    const members = await fetchPatentFamilyODP(patentNumber, settings.usptoApiKey);
    if (members === null) {
      // Return stale cache if available
      if (cached) return this.parseJsonArray<PatentFamilyMember>(cached.members);
      return [];
    }

    // Cache the result
    await this.prisma.patentFamily.upsert({
      where: { patentNumber },
      create: { patentNumber, members: JSON.stringify(members), fetchedAt: new Date() },
      update: { members: JSON.stringify(members), fetchedAt: new Date() },
    });

    return members;
  }

  private isStale(fetchedAt: Date): boolean {
    const ageMs = Date.now() - fetchedAt.getTime();
    return ageMs > CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  private formatResponse(detail: PatentDetail): FormattedPatentDetail {
    return {
      patentNumber: detail.patentNumber,
      title: detail.title,
      abstract: detail.abstract,
      filingDate: detail.filingDate,
      grantDate: detail.grantDate,
      assignee: this.parseJsonArray(detail.assignee),
      inventors: this.parseJsonArray(detail.inventors),
      cpcClassifications: this.parseJsonArray(detail.cpcClassifications),
      claimsText: detail.claimsText,
      claimCount: detail.claimCount,
      patentType: detail.patentType,
    };
  }

  private parseJsonArray<T = unknown>(json: string | null): T[] {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }
}
