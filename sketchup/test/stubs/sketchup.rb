# Мінімальна імітація SketchUp Ruby API для тестів розширення поза SketchUp.
$loaded_files = []
def file_loaded?(f); $loaded_files.include?(f); end
def file_loaded(f); $loaded_files << f; end
MB_YESNO = 4; IDYES = 6

class Numeric
  def m; self / 0.0254; end      # метри → дюйми (внутрішні одиниці SketchUp)
  def to_m; self * 0.0254; end   # дюйми → метри
end

module Geom
  class Point3d
    attr_reader :x, :y, :z
    def initialize(x = 0, y = 0, z = 0); x, y, z = x.to_a if x.is_a?(Array); @x, @y, @z = x.to_f, y.to_f, z.to_f; end
    def to_a; [@x, @y, @z]; end
  end
  class Vector3d < Point3d; end
  class Transformation
    attr_reader :t, :axes
    def initialize(t = [0, 0, 0]); @t = t; end
    def self.axes(o, x, y, z); r = new(o.to_a); r.instance_variable_set(:@axes, [x, y, z]); r; end
    def *(o)
      o.is_a?(Transformation) ? Transformation.new([0, 1, 2].map { |i| @t[i] + o.t[i] }) : Point3d.new(*[0, 1, 2].map { |i| o.to_a[i] + @t[i] })
    end
  end
end

module Sketchup
  def self.register_extension(*); true; end
  def self.version; '24.0.0'; end
  class << self; attr_accessor :active_model; end
  class Color; def initialize(*a); @rgb = a; end; end
  module Attr
    def set_attribute(d, k, v); (@attrs ||= {})[[d, k]] = v; end
    def get_attribute(d, k, dflt = nil); (@attrs ||= {}).fetch([d, k], dflt); end
  end
  class Layer; attr_reader :name; def initialize(n); @name = n; end; def visible?; true; end; end
  class Mesh
    def initialize(pts, polys); @pts = pts; @polys = polys; end
    def polygons; @polys; end
    def point_at(i); Geom::Point3d.new(*@pts[i - 1]); end
  end
  class Face
    include Attr
    attr_accessor :layer, :pushed, :normal_z
    def initialize(pts = [], layer = nil); @pts = pts; @layer = layer; @normal_z = 1; @valid = true; end
    def mesh(_flags = 0); Mesh.new(@pts, [[1, 2, 3]] + (@pts.size == 4 ? [[1, 3, 4]] : [])); end
    def hidden?; false; end
    def normal; Geom::Vector3d.new(0, 0, @normal_z); end
    def reverse!; @normal_z = -@normal_z; self; end
    def pushpull(d); @pushed = d; end
    def erase!; @valid = false; end
    def valid?; @valid; end
  end
  class Vertex; attr_reader :position; def initialize(p); @position = Geom::Point3d.new(*p); end; end
  class Edge
    attr_reader :start, :end, :layer
    def initialize(p, q, layer); @start = Vertex.new(p); @end = Vertex.new(q); @layer = layer; end
    def hidden?; false; end
  end
  class Entities
    include Enumerable
    attr_reader :list, :faces, :texts
    def initialize(items = []); @list = items; @faces = []; @texts = []; end
    def each(&b); @list.each(&b); end
    def to_a; @list.dup; end
    def add_group; g = Group.new; @list << g; g; end
    def add_face(*pts); f = Face.new(pts.flatten.size == 3 ? [pts] : pts); @faces << f; f; end
    def add_circle(c, n, r, seg); Array.new(seg) { :edge }; end
    def add_text(t, p); x = Struct.new(:text, :pos, :layer).new(t, p); @texts << x; x; end
  end
  class Group
    include Attr
    attr_accessor :name, :layer, :material, :transformation
    attr_reader :entities, :moved
    def initialize(items = [], tr = Geom::Transformation.new, name = '', layer = nil); @entities = Entities.new(items); @transformation = tr; @name = name; @layer = layer; end
    def hidden?; false; end
    def transform!(t); @moved = t; end
    def erase!; @erased = true; end
  end
  class ComponentInstance < Group; def definition; self; end; end
  class Layers
    def initialize; @h = {}; end
    def [](n); @h[n]; end
    def add(n); @h[n] = Layer.new(n); end
    def names; @h.keys; end
  end
  class Material; attr_accessor :color, :alpha; end
  class Materials; def initialize; @h = {}; end; def [](n); @h[n]; end; def add(n); @h[n] = Material.new; end; end
  class Model
    include Attr
    attr_reader :entities, :layers, :materials, :ops
    attr_accessor :selection
    def initialize(items); @entities = Entities.new(items); @selection = []; @layers = Layers.new; @materials = Materials.new; @ops = []; end
    def title; 'Тест'; end
    def options; { 'UnitsOptions' => { 'LengthUnit' => 2 } }; end
    def start_operation(n, *_); @ops << [:start, n]; end
    def commit_operation; @ops << [:commit]; end
    def abort_operation; @ops << [:abort]; end
  end
end

module UI
  @messages = []
  class << self; attr_reader :messages; end
  def self.messagebox(t, *_); @messages << t; IDYES; end
  def self.savepanel(*_); nil; end
  class HtmlDialog
    STYLE_DIALOG = 0
    attr_reader :scripts, :callbacks
    def initialize(*_); @scripts = []; @callbacks = {}; end
    def set_file(f); @file = f; end
    def add_action_callback(n, &b); @callbacks[n] = b; end
    def show; @visible = true; end
    def visible?; @visible; end
    def bring_to_front; end
    def execute_script(s); @scripts << s; end
  end
  class Command
    attr_accessor :tooltip, :status_bar_text, :small_icon, :large_icon
    def initialize(t, &b); @t = t; @b = b; end
  end
  class Menu; def add_submenu(*_); self; end; def add_item(*_); end; def add_separator; end; end
  def self.menu(*_); Menu.new; end
  class Toolbar; def initialize(*_); end; def add_item(*_); end; def restore; end; end
end
