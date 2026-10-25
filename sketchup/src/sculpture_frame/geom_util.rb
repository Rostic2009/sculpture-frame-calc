# Чиста геометрія без SketchUp API (перевіряється тестами поза SketchUp).
module SculptureFrame
  module GeomUtil
    module_function

    # Ланцюжок відрізків [[p,q],...] (p, q — [x,y,z]) у полілінію від кінця, найближчого до start.
    # Повертає масив точок; відрізки, що не з'єднуються з ланцюжком, ігноруються.
    def chain(segs, start = [0.0, 0.0, 0.0], tol = 1e-3)
      return [] if segs.empty?
      key = ->(p) { p.map { |v| (v / tol).round }.join(',') }
      adj = Hash.new { |h, k| h[k] = [] }
      segs.each_with_index { |(p, q), i| adj[key.call(p)] << [i, 0]; adj[key.call(q)] << [i, 1] }
      ends = adj.select { |_, v| v.size == 1 }.map { |_, v| s = segs[v[0][0]]; s[v[0][1]] }
      cands = ends.empty? ? segs.flatten(1) : ends
      first = cands.min_by { |p| dist(p, start) }
      used = Array.new(segs.size, false)
      pts = [first]
      cur = first
      loop do
        nxt = adj[key.call(cur)].find { |i, _| !used[i] }
        break unless nxt
        i, e = nxt
        used[i] = true
        cur = segs[i][1 - e]
        pts << cur
      end
      pts
    end

    def dist(a, b)
      Math.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2 + (a[2] - b[2])**2)
    end

    # Унікальні вузли з відрізків (злиття в межах tol, м) → [nodes, elems]: nodes [[x,y,z]], elems [[i,j]].
    def graph(segs, tol = 0.005)
      nodes = []
      find = lambda do |p|
        idx = nodes.index { |n| dist(n, p) <= tol }
        return idx if idx
        nodes << p
        nodes.size - 1
      end
      elems = []
      segs.each do |p, q|
        i = find.call(p)
        j = find.call(q)
        elems << [i, j] unless i == j || elems.include?([i, j]) || elems.include?([j, i])
      end
      [nodes, elems]
    end

    # Ортонормований базис для стрижня з напрямком d: [x, y, z], z = d.
    def frame_axes(d)
      l = Math.sqrt(d[0]**2 + d[1]**2 + d[2]**2)
      z = d.map { |v| v / l }
      ref = z[2].abs > 0.95 ? [1.0, 0.0, 0.0] : [0.0, 0.0, 1.0]
      x = cross(ref, z)
      lx = Math.sqrt(x[0]**2 + x[1]**2 + x[2]**2)
      x = x.map { |v| v / lx }
      y = cross(z, x)
      [x, y, z]
    end

    def cross(a, b)
      [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    end

    # Колір за коефіцієнтом використання U.
    def u_color(u)
      return [46, 133, 64] if u <= 0.7
      return [214, 158, 46] if u <= 0.9
      return [221, 107, 32] if u <= 1.0
      [197, 48, 48]
    end
  end
end
