Pod::Spec.new do |s|
  s.name             = 'ayni_sdk'
  s.version          = '0.1.0'
  s.summary          = 'Native device profile fields for ayni_sdk.'
  s.description      = 'Reads coarse device memory and available SoC metadata.'
  s.homepage         = 'https://github.com/ayni-tesis/ayni_sdk_monorepo'
  s.license          = { :file => '../LICENSE' }
  s.author           = { 'Ayni' => 'dev@ayni.dev' }
  s.source           = { :path => '.' }
  s.source_files = 'Classes/**/*'
  s.dependency 'Flutter'
  s.platform = :ios, '11.0'
  s.swift_version = '5.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
