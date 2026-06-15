import { describe, it, expect } from 'vitest'
import { decodeDataUrl } from './photoStorage.js'

describe('decodeDataUrl', () => {
  it('separa mime y bytes de un data URL base64', () => {
    // "Hi" en base64 = "SGk="
    const r = decodeDataUrl('data:image/jpeg;base64,SGk=')
    expect(r).not.toBeNull()
    expect(r!.contentType).toBe('image/jpeg')
    expect(r!.bytes.toString('utf8')).toBe('Hi')
  })
  it('default a image/jpeg si no hay mime', () => {
    const r = decodeDataUrl('data:;base64,SGk=')
    expect(r!.contentType).toBe('image/jpeg')
  })
  it('basura / vacío → null', () => {
    expect(decodeDataUrl('')).toBeNull()
    expect(decodeDataUrl('no-soy-un-data-url')).toBeNull()
    expect(decodeDataUrl(undefined as unknown as string)).toBeNull()
  })
})
