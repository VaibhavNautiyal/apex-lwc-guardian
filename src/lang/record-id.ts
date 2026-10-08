/** Key prefixes of common standard objects. Custom objects use `a` plus two characters. */
// prettier-ignore
const KNOWN_PREFIXES = new Set([
  '001', '003', '005', '006', '00Q', '500', '00G', '00D', '00e', '00E', '012', '01p', '00N', '701',
  '800', '801', '02i', '00T', '00U', '015', '068', '069', '0PS', '01t', '01s', '01u', '0Q0', '00O',
  '01Z', '00X', '02s', '00h', '0DM', '0Af', '0Xa', '0Hs', '0WO', '0Ca', '0Ka',
])

const CHECKSUM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'

function checksum(id15: string): string {
  let suffix = ''
  for (let chunk = 0; chunk < 3; chunk++) {
    let bits = 0
    for (let i = 0; i < 5; i++) {
      const c = id15[chunk * 5 + i]
      if (c >= 'A' && c <= 'Z') bits |= 1 << i
    }
    suffix += CHECKSUM_CHARS[bits]
  }
  return suffix
}

/**
 * True for a 15 or 18 character value that looks like a real record ID: a known key prefix, at
 * least one digit, and either a valid 18-character checksum or the reserved `0` at position 6.
 */
export function looksLikeRecordId(value: string): boolean {
  if (!/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(value)) return false
  if (!/[0-9]/.test(value)) return false
  const prefix = value.slice(0, 3)
  if (!KNOWN_PREFIXES.has(prefix) && !/^a[0-9A-Za-z]{2}$/.test(prefix)) return false
  if (value.length === 18) return checksum(value.slice(0, 15)) === value.slice(15)
  return value[5] === '0'
}
