class SketchupExtension
  attr_accessor :description, :version, :creator, :copyright
  def initialize(name, path); @name = name; @path = path; end
end
