require 'xcodeproj'
require 'fileutils'

# Generated products stay outside the source tree; the test compiles the owning presenter.
directory = File.expand_path(ARGV.fetch(0))
FileUtils.mkdir_p(directory)
variant = ARGV[1] || 'input'
fixtures = {
  'input' => ['NativeInput', 'InputTests', ['SystemTextEditor.swift'], 'EditorApp.swift'],
  'composition' => ['NativeComposition', 'CompositionTests', ['SystemTextEditor.swift'], 'EditorApp.swift'],
  'adaptation' => ['NativeAdaptation', 'AdaptationTests', ['SystemTextEditor.swift', 'SystemCollectionDetail.swift'], 'EditorApp.swift'],
  'navigation' => ['NativeNavigation', 'NavigationTests', ['SystemPageNavigation.swift'], 'NavigationApp.swift'],
  'accessibility' => ['NativeAccessibility', 'AccessibilityTests', ['SystemTextEditor.swift', 'SystemCollection.swift'], 'AccessibilityApp.swift']
}
name, test_name, presenter_names, app_source = fixtures.fetch(variant)
presenters = presenter_names.map do |file|
  destination = File.join(directory, file)
  FileUtils.cp(File.expand_path('../../native/' + file, __dir__), destination)
  destination
end
project = Xcodeproj::Project.new(File.join(directory, name + '.xcodeproj'))
app = project.new_target(:application, name, :ios, '17.0')
tests = project.new_target(:ui_test_bundle, test_name, :ios, '17.0')
tests.add_dependency(app)
(presenters + [File.join(__dir__, app_source)]).each do |path|
  app.source_build_phase.add_file_reference(project.main_group.new_file(path))
end
tests.source_build_phase.add_file_reference(project.main_group.new_file(File.join(__dir__, test_name + '.swift')))
[app, tests].each do |target|
  target.build_configurations.each do |configuration|
    configuration.build_settings.merge!({
      'SWIFT_VERSION' => '5.0', 'GENERATE_INFOPLIST_FILE' => 'YES',
      'CODE_SIGNING_ALLOWED' => 'NO', 'TARGETED_DEVICE_FAMILY' => '1,2',
      'PRODUCT_BUNDLE_IDENTIFIER' => "studio.threadlabs.systemui.#{name.downcase}.#{target.name.downcase}",
      'IPHONEOS_DEPLOYMENT_TARGET' => '17.0'
    })
  end
end
app.build_configurations.each do |configuration|
  configuration.build_settings['INFOPLIST_KEY_UILaunchScreen_Generation'] = 'YES'
  configuration.build_settings['INFOPLIST_KEY_UIApplicationSceneManifest_Generation'] = 'YES'
  if variant == 'adaptation'
    configuration.build_settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = 'ADAPTATION_FIXTURE'
    configuration.build_settings['INFOPLIST_KEY_UISupportedInterfaceOrientations'] = 'UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'
  end
end
tests.build_configurations.each { |configuration| configuration.build_settings['TEST_TARGET_NAME'] = app.name }
project.root_object.attributes['TargetAttributes'] = { tests.uuid => { 'TestTargetID' => app.uuid } }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app); scheme.add_test_target(tests); scheme.set_launch_target(app)
scheme.save_as(project.path, name)
puts project.path
