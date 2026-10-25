# Каркас скульптури — розширення SketchUp.
# Розрахунок сталевого каркаса скульптури за ДБН прямо по 3D-моделі SketchUp:
# групи моделі → частини скульптури, лінії на тезі «Каркас» → стрижні, результат → труби в модель.
require 'sketchup.rb'
require 'extensions.rb'

module SculptureFrame
  PLUGIN_ID = 'sculpture_frame'.freeze
  VERSION = '0.1.0'.freeze

  unless file_loaded?(__FILE__)
    ex = SketchupExtension.new('Каркас скульптури', File.join(PLUGIN_ID, 'main'))
    ex.description = 'Розрахунок сталевого каркаса скульптури з квадратних труб за ДБН: вітер, сніг, сейсміка, МСЕ, анкери, фундамент, звіт PDF. Геометрія — з моделі SketchUp.'
    ex.version = VERSION
    ex.creator = 'sculpture-frame-calc'
    ex.copyright = '2026'
    Sketchup.register_extension(ex, true)
    file_loaded(__FILE__)
  end
end
