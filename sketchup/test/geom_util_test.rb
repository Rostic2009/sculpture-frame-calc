require 'minitest/autorun'
require_relative '../src/sculpture_frame/geom_util'

class GeomUtilTest < Minitest::Test
  G = SculptureFrame::GeomUtil

  def test_chain_orders_from_point_nearest_start
    segs = [[[2, 0, 1], [3, 0, 0.5]], [[0.1, 0, 3], [1, 0, 2]], [[1, 0, 2], [2, 0, 1]]]
    pts = G.chain(segs, [0, 0, 3])
    assert_equal [[0.1, 0, 3], [1, 0, 2], [2, 0, 1], [3, 0, 0.5]], pts
  end

  def test_chain_reversed_segments
    segs = [[[1, 0, 2], [0, 0, 3]], [[2, 0, 1], [1, 0, 2]]]
    assert_equal [[0, 0, 3], [1, 0, 2], [2, 0, 1]], G.chain(segs, [0, 0, 3])
  end

  def test_graph_merges_close_nodes_and_drops_duplicates
    segs = [[[0, 0, 0], [1, 0, 0]], [[1.002, 0, 0], [1, 1, 0]], [[1, 0, 0], [0, 0, 0]]]
    nodes, elems = G.graph(segs, 0.005)
    assert_equal 3, nodes.size
    assert_equal [[0, 1], [1, 2]], elems
  end

  def test_frame_axes_orthonormal
    [[1, 0, 0], [0, 0, 5], [1, 2, 3], [0, -1, 0.01]].each do |d|
      x, y, z = G.frame_axes(d)
      dot = ->(a, b) { a.zip(b).sum { |p, q| p * q } }
      assert_in_delta 1, dot.call(x, x), 1e-12
      assert_in_delta 1, dot.call(y, y), 1e-12
      assert_in_delta 0, dot.call(x, y), 1e-12
      assert_in_delta 0, dot.call(x, z), 1e-12
      l = Math.sqrt(dot.call(d, d))
      d.each_with_index { |v, i| assert_in_delta v / l, z[i], 1e-12 }
    end
  end

  def test_u_color_bands
    assert_equal [46, 133, 64], G.u_color(0.5)
    assert_equal [197, 48, 48], G.u_color(1.2)
  end
end
