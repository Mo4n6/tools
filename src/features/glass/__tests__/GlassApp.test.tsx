import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import GlassApp from '../GlassApp';
import { TIERS } from '../pipeline';
import { usablePresets } from '../presets';

describe('GlassApp', () => {
  const markup = renderToStaticMarkup(<GlassApp />);

  it('offers every tier as a choice rather than picking one', () => {
    for (const tier of TIERS) {
      expect(markup).toContain(tier.label);
      expect(markup).toContain(tier.summary);
    }
  });

  it('states the cost of each tier up front', () => {
    for (const tier of TIERS) {
      expect(markup).toContain(tier.download);
    }
  });

  it('starts on a local tier so the first run needs no download', () => {
    // Attribute order is React's business; assert the pairing, not the spelling.
    expect(markup).toMatch(/<input[^>]*checked=""[^>]*value="lanczos"/);
    expect(markup).not.toMatch(/<input[^>]*checked=""[^>]*value="neural"/);
  });

  it('renders the factor buttons for the default tier', () => {
    expect(markup).toContain('>2x<');
    expect(markup).toContain('>3x<');
    expect(markup).toContain('>4x<');
  });

  it('cannot run before an image is chosen', () => {
    expect(markup).toMatch(/Upscale<\/button>/);
    expect(markup).toContain('disabled=""');
  });

  it('offers a sample for each tier, so the difference can be seen', () => {
    for (const label of ['Sprite', 'Detail', 'Soft']) {
      expect(markup).toContain(`>${label}</button>`);
    }
  });

  it('ships known models for the neural tier to offer', () => {
    // The weights panel only renders once Neural is selected, so this asserts
    // the list the panel draws from rather than the default markup.
    expect(usablePresets().length).toBeGreaterThan(0);
  });

  it('keeps the weights panel out of the way until a tier needs one', () => {
    // Lanczos is the default and needs no model; showing a model picker beside
    // it would suggest the first run costs a download when it does not.
    expect(markup).not.toContain('Known model');
    expect(markup).not.toContain('Local file');
  });

  it('carries its attribution', () => {
    expect(markup).toContain('Mo4n6');
    expect(markup).toContain('https://github.com/Mo4n6/tools');
  });
});
