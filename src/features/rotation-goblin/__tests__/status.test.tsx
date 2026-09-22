import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PipelineStatusCard, formatTimestamp } from '../PipelineStatusCard';
import { dataMeta } from '../sampleData';
import RotationGoblinApp from '../RotationGoblinApp';

describe('data pull status', () => {
  it('always renders the status card in the dashboard header', () => {
    const html = renderToStaticMarkup(<RotationGoblinApp />);
    expect(html).toContain('aria-label="Live data pull status"');
    expect(html).toContain('Last snapshot pull');
    expect(html).toContain(dataMeta.technicalSessionAsOf);
  });
  it('shows successful completion and the workflow link', () => {
    const html = renderToStaticMarkup(<PipelineStatusCard healthy reason="Current" />);
    expect(html).toContain('DATA CURRENT');
    expect(html).toContain('View latest recorded workflow');
    expect(html).toContain(formatTimestamp(dataMeta.technicals.generatedAt));
  });
  it('shows a failed pull without hiding the last snapshot date', () => {
    const meta = { ...dataMeta, pipeline: { ...dataMeta.pipeline, conclusion: 'failure' as const } };
    const html = renderToStaticMarkup(<PipelineStatusCard healthy={false} reason="Refresh failed" meta={meta} />);
    expect(html).toContain('FAILURE');
    expect(html).toContain('CHECK DATA');
    expect(html).toContain(formatTimestamp(meta.technicals.generatedAt));
  });
  it('handles absent or invalid timestamps explicitly', () => {
    expect(formatTimestamp(null)).toBe('Not recorded');
    expect(formatTimestamp('invalid')).toBe('Not recorded');
    expect(formatTimestamp('2026-09-22T18:55:57Z')).toBe('2026-09-22 18:55:57 UTC');
  });
});
