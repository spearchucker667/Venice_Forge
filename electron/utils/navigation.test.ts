// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { checkPathContained } from './navigation'

describe('checkPathContained', () => {
  it('allows a file inside the root', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'))
    const subdir = path.join(dir, 'sub')
    fs.mkdirSync(subdir)
    const file = path.join(subdir, 'page.html')
    fs.writeFileSync(file, 'x')
    expect(checkPathContained(file, dir)).toBe(true)
  })

  it('allows the index.html at the root', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'))
    const indexHtml = path.join(dir, 'index.html')
    fs.writeFileSync(indexHtml, 'x')
    expect(checkPathContained(indexHtml, dir)).toBe(true)
  })

  it('rejects a file outside the root', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'))
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-other-'))
    const file = path.join(other, 'leak.html')
    fs.writeFileSync(file, 'x')
    expect(checkPathContained(file, dir)).toBe(false)
  })

  it('rejects a path-traversal attack', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'))
    const evil = path.join(dir, '..', '..', 'etc', 'passwd')
    expect(checkPathContained(evil, dir)).toBe(false)
  })
})
