const { createRunOncePlugin, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const REQUIRE_JSON = "require 'json'";
const REQUIRE_FILEUTILS = "require 'fileutils'";
const MARKER_START = '    # codex-ios-26-fmt-fix start';
const MARKER_END = '    # codex-ios-26-fmt-fix end';

const PODFILE_SNIPPET = `
    # codex-ios-26-fmt-fix start
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'

      target.build_configurations.each do |build_configuration|
        definitions = build_configuration.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
        definitions = [definitions] unless definitions.is_a?(Array)
        definitions << 'FMT_USE_CONSTEVAL=0' unless definitions.include?('FMT_USE_CONSTEVAL=0')
        build_configuration.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = definitions

        cxx_flags = build_configuration.build_settings['OTHER_CPLUSPLUSFLAGS'] || ['$(inherited)']
        cxx_flags = [cxx_flags] unless cxx_flags.is_a?(Array)
        cxx_flags << '-DFMT_USE_CONSTEVAL=0' unless cxx_flags.include?('-DFMT_USE_CONSTEVAL=0')
        build_configuration.build_settings['OTHER_CPLUSPLUSFLAGS'] = cxx_flags
      end
    end

    fmt_base_header = File.join(installer.sandbox.root.to_s, 'fmt/include/fmt/base.h')
    if File.exist?(fmt_base_header)
      contents = File.read(fmt_base_header)
      apple_clause = <<~RUBY.chomp
        #elif defined(__apple_build_version__) && __apple_build_version__ < 14000029L
        #  define FMT_USE_CONSTEVAL 0  // consteval is broken in Apple clang < 14.
      RUBY
      patched_clause = <<~RUBY.chomp
        #elif defined(__apple_build_version__)
        #  define FMT_USE_CONSTEVAL 0  // Disabled for Apple toolchains due to newer SDK compile regressions.
      RUBY

      if contents.include?(apple_clause) && !contents.include?(patched_clause)
        FileUtils.chmod('u+w', fmt_base_header)
        File.write(fmt_base_header, contents.sub(apple_clause, patched_clause))
      end
    end
    # codex-ios-26-fmt-fix end
`;

function addFileUtilsRequire(contents) {
  if (contents.includes(REQUIRE_FILEUTILS)) {
    return contents;
  }

  if (contents.includes(REQUIRE_JSON)) {
    return contents.replace(REQUIRE_JSON, `${REQUIRE_JSON}\n${REQUIRE_FILEUTILS}`);
  }

  return `${REQUIRE_FILEUTILS}\n${contents}`;
}

function addFmtFixToPodfile(contents) {
  if (contents.includes(MARKER_START) && contents.includes(MARKER_END)) {
    return contents;
  }

  const reactNativePostInstallPattern =
    /(post_install do \|installer\|[\s\S]*?react_native_post_install\([\s\S]*?\n    \)\n)/m;

  if (!reactNativePostInstallPattern.test(contents)) {
    throw new Error('Could not find react_native_post_install block in ios/Podfile');
  }

  return contents.replace(reactNativePostInstallPattern, `$1${PODFILE_SNIPPET}`);
}

function withIos26FmtFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      contents = addFileUtilsRequire(contents);
      contents = addFmtFixToPodfile(contents);

      fs.writeFileSync(podfilePath, contents);
      return modConfig;
    },
  ]);
}

module.exports = createRunOncePlugin(
  withIos26FmtFix,
  'with-ios-26-fmt-fix',
  '1.0.0'
);
