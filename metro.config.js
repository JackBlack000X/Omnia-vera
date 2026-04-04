const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.server = {
  ...config.server,
  host: '0.0.0.0',
};

config.resolver = {
  ...config.resolver,
  assetExts: [...(config.resolver?.assetExts ?? []), 'mov'],
};

module.exports = config;
