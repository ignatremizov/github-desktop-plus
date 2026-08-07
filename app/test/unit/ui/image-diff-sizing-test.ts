import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Image } from '../../../src/models/diff'
import { getSvgSize } from '../../../src/ui/diff/image-diffs/sizing'
import { getSvgDataUri } from '../../../src/ui/diff/image-diffs/image-container'

describe('image-diff/sizing getSvgSize', () => {
  it('returns null for non-SVG images', () => {
    const img = new Image(Buffer.from(''), '', 'image/png', 0)
    assert.equal(getSvgSize(img), null)
  })

  it('extracts dimensions from explicit width and height attributes', () => {
    const svg = '<svg width="800px" height="600px"><rect/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    assert.deepEqual(getSvgSize(img), { width: 800, height: 600 })
  })

  it('does not treat similarly named attributes as dimensions', () => {
    const svg = '<svg stroke-width="2" width="800" height="600"><rect/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    assert.deepEqual(getSvgSize(img), { width: 800, height: 600 })
  })

  it('converts absolute physical units to CSS pixels', () => {
    const svg = '<svg width="1in" height="2.54cm"><rect/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    assert.deepEqual(getSvgSize(img), { width: 96, height: 96 })
  })

  it('uses the viewBox for dimensions expressed in relative units', () => {
    const svg =
      '<svg width="10em" height="5rem" viewBox="0 0 640 320"><rect/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    assert.deepEqual(getSvgSize(img), { width: 640, height: 320 })
  })

  it('extracts dimensions from viewBox when width and height are missing or percentage', () => {
    const svg =
      '<svg viewBox="0 0 1200 800" width="100%" height="100%"><g/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    assert.deepEqual(getSvgSize(img), { width: 1200, height: 800 })
  })

  it('calculates aspect height when only width and viewBox are specified', () => {
    const svg = '<svg width="600" viewBox="0 0 1200 800"><g/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    assert.deepEqual(getSvgSize(img), { width: 600, height: 400 })
  })

  it('calculates aspect width when only height and viewBox are specified', () => {
    const svg = '<svg height="400" viewBox="0 0 1200 800"><g/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    assert.deepEqual(getSvgSize(img), { width: 600, height: 400 })
  })

  it('handles comma-separated viewBox coordinates', () => {
    const svg = '<svg viewBox="0, 0, 1920, 1080"><g/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    assert.deepEqual(getSvgSize(img), { width: 1920, height: 1080 })
  })
})

describe('image-diff/image-container getSvgDataUri', () => {
  it('replaces width=100% and injects missing height into root svg tag', () => {
    const svg =
      '<svg id="my-svg" width="100%" viewBox="0 0 1687.31 1467.06"><g/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    const res = getSvgDataUri(img)
    assert.ok(res.src.startsWith('data:image/svg+xml;base64,'))
    const decoded = Buffer.from(
      res.src.replace('data:image/svg+xml;base64,', ''),
      'base64'
    ).toString('utf-8')
    assert.ok(decoded.includes('width="1687.31"'))
    assert.ok(decoded.includes('height="1467.06"'))
  })

  it('strips max-width and max-height from root svg tag style attribute', () => {
    const svg =
      '<svg style="max-width: 1687.32px; background-color: white;" viewBox="0 0 1687.31 1467.06"><g/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    const res = getSvgDataUri(img)
    const decoded = Buffer.from(
      res.src.replace('data:image/svg+xml;base64,', ''),
      'base64'
    ).toString('utf-8')
    assert.ok(!decoded.includes('max-width'))
    assert.ok(decoded.includes('background-color: white;'))
  })

  it('does not confuse data-style or stroke-width with root sizing attributes', () => {
    const svg =
      '<svg data-style="max-width: 1px" stroke-width="2" viewBox="0 0 800 600"><g/></svg>'
    const img = new Image(Buffer.from(svg), '', 'image/svg+xml', svg.length)
    const res = getSvgDataUri(img)
    const decoded = Buffer.from(
      res.src.replace('data:image/svg+xml;base64,', ''),
      'base64'
    ).toString('utf-8')

    assert.ok(decoded.includes('data-style="max-width: 1px"'))
    assert.ok(decoded.includes('stroke-width="2"'))
    assert.ok(decoded.includes('width="800"'))
    assert.ok(decoded.includes('height="600"'))
  })
})
