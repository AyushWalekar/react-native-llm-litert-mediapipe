require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'react-native-llm-litert-mediapipe'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platform       = :ios, '14.0'
  s.swift_version  = '5.4'
  s.source         = { :git => 'https://github.com/AyushWalekar/react-native-llm-litert-mediapipe.git', :tag => "v#{s.version}" }
  s.static_framework = true

  # Only include bare RN native files
  s.source_files = [
    'ios/MediaPipeLlm.swift',
    'ios/MediaPipeLlm.m',
    'ios/LlmInferenceModelBare.swift',
    'ios/MediaPipeLlm-Bridging-Header.h'
  ]
  
  s.dependency 'React-Core'
  
  # MediaPipe LLM dependencies
  s.dependency 'MediaPipeTasksGenAI' 
  s.dependency 'MediaPipeTasksGenAIC'
end
