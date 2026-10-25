$LOAD_PATH.unshift File.join(__dir__, 'stubs')
require 'minitest/autorun'
require 'json'
require 'base64'
require 'sketchup.rb'
require_relative '../src/sculpture_frame/main'

class MainTest < Minitest::Test
  SF = SculptureFrame
  IN = 1 / 0.0254 # дюймів у метрі

  def setup
    SF.instance_variable_set(:@dialog, nil)
    UI.messages.clear
  end

  def last_call(name)
    s = SF.dialog.scripts.reverse.find { |x| x.start_with?("SFC.#{name}(") }
    s && JSON.parse(s.sub("SFC.#{name}(", '').chomp(')'))
  end

  def test_parts_from_selected_groups_in_meters_with_transform
    tri = Sketchup::Face.new([[0, 0, 0], [IN, 0, 0], [0, IN, 0]])           # 1 м катети, у дюймах
    inner = Sketchup::Group.new([tri], Geom::Transformation.new([0, 0, 2 * IN])) # вкладена група +2 м по Z
    g = Sketchup::Group.new([inner], Geom::Transformation.new([IN, 0, 0]), 'Тулуб')
    Sketchup.active_model = Sketchup::Model.new([g]).tap { |m| m.selection = [g] }
    SF.send_parts
    parts = last_call('receiveParts')
    assert_equal 1, parts.size
    assert_equal 'Тулуб', parts[0]['name']
    v = Base64.decode64(parts[0]['tris']).unpack('e*')
    assert_equal 9, v.size
    assert_in_delta 1.0, v[0], 1e-6  # x = 0 + 1 м зсуву
    assert_in_delta 2.0, v[2], 1e-6  # z = 0 + 2 м
    assert_in_delta 2.0, v[3], 1e-6  # друга вершина: 1 м + 1 м
  end

  def test_no_selection_message
    Sketchup.active_model = Sketchup::Model.new([])
    SF.send_parts
    assert_match(/Виділіть групи/, UI.messages.last)
  end

  def test_frame_lines_with_section_from_tag_and_inherited_group_tag
    l1 = Sketchup::Layer.new('Каркас □80×4')
    l2 = Sketchup::Layer.new('Каркас 60x3')
    e1 = Sketchup::Edge.new([0, 0, 0], [0, 0, 1.5 * IN], l1)
    e2 = Sketchup::Edge.new([0, 0, 1.5 * IN], [IN, 0, 1.5 * IN], nil)
    grp = Sketchup::Group.new([e2], Geom::Transformation.new, 'рами', l2)
    other = Sketchup::Edge.new([0, 0, 0], [IN, IN, 0], Sketchup::Layer.new('Допоміжні'))
    Sketchup.active_model = Sketchup::Model.new([e1, grp, other])
    SF.send_frame
    segs = last_call('receiveFrame')
    assert_equal 2, segs.size
    assert_equal '□80×4', segs[0]['sec']
    assert_equal '□60×3', segs[1]['sec']
    assert_in_delta 1.5, segs[0]['q'][2], 1e-9
  end

  def test_ridge_chained_from_origin_side
    lr = Sketchup::Layer.new('Гребінь Шлейф мантії')
    es = [[[6, 0, 1.3], [9, 0, 0.5]], [[-0.2, 0, 4.5], [3, 0, 2.8]], [[3, 0, 2.8], [6, 0, 1.3]]].map { |p, q| Sketchup::Edge.new(p.map { |v| v * IN }, q.map { |v| v * IN }, lr) }
    Sketchup.active_model = Sketchup::Model.new(es)
    SF.send_ridge
    r = last_call('receiveRidge')
    assert_equal 'Шлейф мантії', r[0]['name']
    assert_equal [[-0.2, 0, 4.5], [3, 0, 2.8], [6, 0, 1.3], [9, 0, 0.5]], r[0]['pts']
  end

  def test_build_result_tubes_plates_foundations
    m = Sketchup::Model.new([])
    Sketchup.active_model = m
    data = { 'colorMode' => 'u', 'marks' => true,
             'nodes' => [{ 'id' => 'A', 'x' => 0, 'y' => 0, 'z' => 0 }, { 'id' => 'B', 'x' => 0, 'y' => 0, 'z' => 1.5 }],
             'elems' => [{ 'i' => 'A', 'j' => 'B', 'b' => 0.1, 't' => 0.005, 'sec' => '□100×5', 'mark' => 'Я1-С1', 'sect' => 'Я1', 'color' => '#2b6cb0', 'u' => 0.45 }],
             'plates' => [{ 'x' => 0, 'y' => 0, 'z' => -0.02, 'B' => 0.3, 'L' => 0.3, 't' => 0.02, 'd' => 0.02, 'la' => 0.48, 'anchors' => [[0.1, 0.1], [-0.1, 0.1]] }],
             'founds' => [{ 'id' => 'Ф1', 'x' => 0, 'y' => 0, 'B' => 2.8, 'L' => 2.8, 'h' => 0.6, 'pedB' => 1.4, 'pedL' => 1.4, 'pedH' => 0.6 }] }
    SF.build_result(data)
    assert_equal [:commit], m.ops.last, "операція не завершилась: #{UI.messages.inspect}"
    root = m.entities.list.find { |e| e.is_a?(Sketchup::Group) && e.get_attribute('sculpture_frame', 'result') }
    refute_nil root
    sect = root.entities.list.find { |e| e.name == 'Секція Я1' }
    tube = sect.entities.list.first
    assert_equal 'Я1-С1', tube.name
    outer = tube.entities.faces.first
    assert_in_delta 1.5 * IN, outer.pushed, 1e-6
    refute tube.entities.faces[1].valid?, 'внутрішній квадрат має бути вирізаний'
    assert_equal 1, root.entities.texts.size
    plates = root.entities.list.find { |e| e.name == 'Опорні плити й анкери' }
    assert_equal 3, plates.entities.list.size # плита + 2 анкери
    fnd = root.entities.list.find { |e| e.name == 'Фундаменти' }
    assert_equal ['Ф1 плита', 'Ф1 підколонник'], fnd.entities.list.map(&:name)
    assert_includes m.layers.names, 'Каркас: Я1'
    assert(SF.dialog.scripts.any? { |s| s.start_with?('SFC.built(1)') })
  end

  def test_sec_from_tag
    assert_equal '□100×5', SF.sec_from_tag('Каркас 100х5')
    assert_equal '□80×3,5', SF.sec_from_tag('Каркас □80×3.5')
    assert_nil SF.sec_from_tag('Каркас')
  end
end
