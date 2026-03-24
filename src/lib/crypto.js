import crypto from 'crypto';

export function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function randomAlphaNumeric(length, charset = 'abcdefghijklmnopqrstuvwxyz0123456789') {
  const chars = charset;
  const size = chars.length;
  const random = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < random.length; i += 1) {
    out += chars[random[i] % size];
  }
  return out;
}
