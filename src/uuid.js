// Package for generating UUID V4 strings.
const random = require('crypto').randomBytes;

// Array of byte to hex value conversions.
const hex = [];
for (var i = 0; i < 256; ++i) {
  hex[i] = (i + 0x100).toString(16).substr(1);
}

// Generates a UUID V4 in the canonical form: XXXXXXXX-XXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
module.exports = () => {
  const conversion = hex;
  const uuid = random(16);
  uuid[6] = (uuid[6] & 0x0f) | 0x40;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  let index = 0;
  return (
    hex[uuid[index++]] + hex[uuid[index++]] +
    hex[uuid[index++]] + hex[uuid[index++]] + '-' +
    hex[uuid[index++]] + hex[uuid[index++]] + '-' +
    hex[uuid[index++]] + hex[uuid[index++]] + '-' +
    hex[uuid[index++]] + hex[uuid[index++]] + '-' +
    hex[uuid[index++]] + hex[uuid[index++]] +
    hex[uuid[index++]] + hex[uuid[index++]] +
    hex[uuid[index++]] + hex[uuid[index++]]
  );
};