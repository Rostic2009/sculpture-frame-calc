# Каркас скульптури — основний модуль розширення.
#  • Вікно розрахунку (UI::HtmlDialog) — той самий застосунок, що й на сайті, плюс міст bridge.js.
#  • Модель → розрахунок: вибрані групи/компоненти → частини скульптури (трикутники в метрах, з урахуванням
#    вкладених груп і трансформацій); лінії на тегах «Каркас…» → стрижні; лінії на тегах «Гребінь…» → гребінь шлейфу.
#  • Розрахунок → модель: труби справжнього профілю (b×t), колір — за секцією або коефіцієнтом використання U,
#    марки, опорні плити й анкери, фундаменти — окремою групою на тегах «Каркас: …».
#  • Проєкт розрахунку зберігається в самому файлі .skp (атрибути моделі).
# Початок координат моделі (осі SketchUp) = центр низу каркаса-ядра на верху постаменту; вісь Z — вгору.
require 'json'
require 'base64'
require 'sketchup.rb'
require_relative 'geom_util'

module SculptureFrame
  DIR = File.dirname(__FILE__)
  DICT = 'sculpture_frame'.freeze
  TAG_FRAME = 'Каркас'.freeze
  TAG_RIDGE = 'Гребінь'.freeze
  RESULT_NAME = 'Каркас (розрахунок)'.freeze
  MAX_TRIS = 400_000

  # ---------------------------------------------------------------- вікно
  def self.dialog
    if Sketchup.version.to_i < 21
      UI.messagebox('Потрібен SketchUp 2021 або новіший (вбудований браузер Chromium 88+).')
      return nil
    end
    if @dialog && @dialog.visible?
      @dialog.bring_to_front
      return @dialog
    end
    @dialog = UI::HtmlDialog.new(
      dialog_title: 'Каркас скульптури — розрахунок за ДБН',
      preferences_key: 'sculpture_frame_dialog',
      scrollable: true, resizable: true, width: 1400, height: 900, left: 60, top: 60,
      min_width: 900, min_height: 600, style: UI::HtmlDialog::STYLE_DIALOG
    )
    @dialog.set_file(File.join(DIR, 'app', 'index.html'))
    add_callbacks(@dialog)
    @dialog.show
    @dialog
  end

  def self.js(code)
    d = dialog
    d.execute_script(code) if d
  end

  def self.add_callbacks(dlg)
    dlg.add_action_callback('sfc_ready') { |_ctx| on_ready }
    dlg.add_action_callback('sfc_get_parts') { |_ctx| send_parts }
    dlg.add_action_callback('sfc_get_frame') { |_ctx| send_frame }
    dlg.add_action_callback('sfc_get_ridge') { |_ctx| send_ridge }
    dlg.add_action_callback('sfc_build') { |_ctx, json| build_result(JSON.parse(json)) }
    dlg.add_action_callback('sfc_clear') { |_ctx| clear_result }
    dlg.add_action_callback('sfc_save') { |_ctx, json| Sketchup.active_model.set_attribute(DICT, 'project', json) }
    dlg.add_action_callback('sfc_save_file') { |_ctx, name, data, kind| save_file(name, data, kind) }
    dlg.add_action_callback('sfc_message') { |_ctx, text| UI.messagebox(text) }
  end

  def self.on_ready
    model = Sketchup.active_model
    info = { name: model.title, units: model.options['UnitsOptions']['LengthUnit'], version: Sketchup.version, ext: VERSION }
    js("SFC.hello(#{info.to_json})")
    stored = model.get_attribute(DICT, 'project')
    js("SFC.loadProject(#{stored})") if stored && !stored.empty?
  end

  # ---------------------------------------------------------------- модель → розрахунок
  # Трикутники всіх граней сутності (рекурсивно), у метрах, у системі координат моделі.
  def self.collect_tris(ents, tr, out)
    ents.each do |e|
      next if e.respond_to?(:hidden?) && e.hidden?
      next if e.respond_to?(:layer) && e.layer && !e.layer.visible?
      case e
      when Sketchup::Face
        mesh = e.mesh(0)
        mesh.polygons.each do |poly|
          pts = poly.map { |i| (tr * mesh.point_at(i.abs)).to_a.map(&:to_m) }
          (1...(pts.size - 1)).each { |k| out.concat(pts[0]).concat(pts[k]).concat(pts[k + 1]) }
        end
      when Sketchup::Group
        collect_tris(e.entities, tr * e.transformation, out)
      when Sketchup::ComponentInstance
        collect_tris(e.definition.entities, tr * e.transformation, out)
      end
    end
    out
  end

  def self.entity_name(e)
    n = e.name.to_s.strip
    n = e.definition.name.to_s.strip if n.empty? && e.respond_to?(:definition)
    n.empty? ? "Частина #{e.entityID}" : n
  end

  def self.send_parts
    model = Sketchup.active_model
    sel = model.selection.select { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
    if sel.empty?
      UI.messagebox('Виділіть групи або компоненти скульптури (кожна група — окрема частина: «Тулуб», «Голова», «Шлейф мантії»…).')
      return
    end
    parts = []
    total = 0
    sel.each do |e|
      tris = collect_tris([e], Geom::Transformation.new, [])
      total += tris.size / 9
      parts << { name: entity_name(e), tris: Base64.strict_encode64(tris.pack('e*')), n: tris.size / 9 }
    end
    if total > MAX_TRIS
      r = UI.messagebox("Модель містить #{total} трикутників — розрахунок площ і перерізів може тривати довго. Продовжити?", MB_YESNO)
      return unless r == IDYES
    end
    js("SFC.receiveParts(#{parts.to_json})")
  end

  # Лінії (ребра) на тегах, назва яких починається з prefix; тег групи успадковується вкладеними ребрами.
  def self.collect_edges(ents, tr, prefix, inherited, out)
    ents.each do |e|
      next if e.respond_to?(:hidden?) && e.hidden?
      tag = e.respond_to?(:layer) && e.layer ? e.layer.name.to_s : ''
      own = tag.start_with?(prefix) ? tag : nil
      case e
      when Sketchup::Edge
        t = own || inherited
        next unless t
        p = (tr * e.start.position).to_a.map(&:to_m)
        q = (tr * e.end.position).to_a.map(&:to_m)
        out << { p: p, q: q, tag: t }
      when Sketchup::Group
        collect_edges(e.entities, tr * e.transformation, prefix, own || inherited, out)
      when Sketchup::ComponentInstance
        collect_edges(e.definition.entities, tr * e.transformation, prefix, own || inherited, out)
      end
    end
    out
  end

  # Переріз із назви тегу: «Каркас □80×4», «Каркас 80x4», «Каркас 100х5» → «□80×4».
  def self.sec_from_tag(tag)
    m = tag.match(/(\d{2,3})\s*[×xXхХ*]\s*(\d+(?:[.,]\d+)?)/)
    m ? "□#{m[1]}×#{m[2].tr('.', ',')}" : nil
  end

  def self.send_frame
    model = Sketchup.active_model
    root = model.selection.to_a.empty? ? model.entities.to_a : model.selection.to_a
    edges = collect_edges(root, Geom::Transformation.new, TAG_FRAME, nil, [])
    if edges.empty?
      UI.messagebox("Не знайдено ліній на тегах «#{TAG_FRAME}…». Накресліть осі стрижнів лініями й призначте їм тег «#{TAG_FRAME}» (переріз можна вказати в назві тегу: «#{TAG_FRAME} □80×4»).")
      return
    end
    segs = edges.map { |s| { p: s[:p], q: s[:q], sec: sec_from_tag(s[:tag]) } }
    js("SFC.receiveFrame(#{segs.to_json})")
  end

  def self.send_ridge
    model = Sketchup.active_model
    edges = collect_edges(model.entities.to_a, Geom::Transformation.new, TAG_RIDGE, nil, [])
    if edges.empty?
      UI.messagebox("Не знайдено ліній на тегах «#{TAG_RIDGE}…». Накресліть гребінь шлейфу полілінією від плечей до землі на тезі «#{TAG_RIDGE} <назва частини>».")
      return
    end
    groups = edges.group_by { |s| s[:tag] }
    out = groups.map do |tag, list|
      name = tag.sub(TAG_RIDGE, '').strip
      pts = GeomUtil.chain(list.map { |s| [s[:p], s[:q]] }, [0.0, 0.0, 0.0], 0.002)
      { name: name, pts: pts.map { |p| p.map { |v| v.round(3) } } }
    end
    js("SFC.receiveRidge(#{out.to_json})")
  end

  # ---------------------------------------------------------------- розрахунок → модель
  def self.layer(model, name)
    model.layers[name] || model.layers.add(name)
  end

  def self.material(model, name, rgb)
    m = model.materials[name] || model.materials.add(name)
    m.color = Sketchup::Color.new(*rgb)
    m
  end

  def self.hex_rgb(hex)
    h = hex.to_s.delete('#')
    h.size == 6 ? [h[0, 2].hex, h[2, 2].hex, h[4, 2].hex] : [128, 128, 128]
  end

  def self.pt(a)
    Geom::Point3d.new(a[0].m, a[1].m, a[2].m)
  end

  # Квадратна труба b×t (м) вздовж осі p→q (м): переріз із отвором, видавлений на довжину.
  def self.tube(ents, p, q, b, t, mat)
    d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
    len = Math.sqrt(d[0]**2 + d[1]**2 + d[2]**2)
    return nil if len < 1e-4
    x, y, z = GeomUtil.frame_axes(d)
    g = ents.add_group
    e = g.entities
    hb = (b / 2.0).m
    hi = (b / 2.0 - t).m
    outer = e.add_face([-hb, -hb, 0], [hb, -hb, 0], [hb, hb, 0], [-hb, hb, 0])
    if hi > 0
      inner = e.add_face([-hi, -hi, 0], [hi, -hi, 0], [hi, hi, 0], [-hi, hi, 0])
      inner.erase! if inner && inner.valid?
    end
    outer.reverse! if outer.normal.z < 0
    outer.pushpull(len.m)
    g.transform!(Geom::Transformation.axes(pt(p), Geom::Vector3d.new(*x), Geom::Vector3d.new(*y), Geom::Vector3d.new(*z)))
    g.material = mat
    g
  end

  # Паралелепіпед: центр низу (x, y, z0), розміри bx × by × h (м).
  def self.box(ents, x, y, z0, bx, by, h, mat)
    g = ents.add_group
    f = g.entities.add_face(pt([x - bx / 2, y - by / 2, z0]), pt([x + bx / 2, y - by / 2, z0]), pt([x + bx / 2, y + by / 2, z0]), pt([x - bx / 2, y + by / 2, z0]))
    f.reverse! if f.normal.z < 0
    f.pushpull(h.m)
    g.material = mat
    g
  end

  def self.rod(ents, x, y, ztop, dia, len, mat)
    g = ents.add_group
    c = g.entities.add_circle(pt([x, y, ztop]), Geom::Vector3d.new(0, 0, 1), (dia / 2.0).m, 12)
    f = g.entities.add_face(c)
    f.reverse! if f.normal.z > 0
    f.pushpull(len.m)
    g.material = mat
    g
  end

  def self.clear_result
    model = Sketchup.active_model
    old = model.entities.select { |e| e.is_a?(Sketchup::Group) && e.get_attribute(DICT, 'result') }
    return if old.empty?
    model.start_operation('Каркас: видалити результат', true)
    old.each(&:erase!)
    model.commit_operation
  end

  # data: {nodes, elems, plates, founds, colorMode: 'u'|'sect', marks: bool}
  def self.build_result(data)
    model = Sketchup.active_model
    model.start_operation('Каркас: побудова за розрахунком', true)
    begin
      model.entities.select { |e| e.is_a?(Sketchup::Group) && e.get_attribute(DICT, 'result') }.each(&:erase!)
      root = model.entities.add_group
      root.name = RESULT_NAME
      root.set_attribute(DICT, 'result', true)
      nodes = {}
      data['nodes'].each { |n| nodes[n['id']] = [n['x'], n['y'], n['z']] }
      by_sect = data['elems'].group_by { |e| e['sect'] || 'Каркас' }
      by_sect.each do |sect, list|
        sg = root.entities.add_group
        sg.name = "Секція #{sect}"
        sg.layer = layer(model, "#{TAG_FRAME}: #{sect}")
        list.each do |e|
          rgb = data['colorMode'] == 'u' ? GeomUtil.u_color(e['u'].to_f) : hex_rgb(e['color'])
          mat = material(model, data['colorMode'] == 'u' ? "Каркас U #{rgb.join('-')}" : "Каркас #{sect}", rgb)
          g = tube(sg.entities, nodes[e['i']], nodes[e['j']], e['b'].to_f, e['t'].to_f, mat)
          next unless g
          g.name = e['mark'].to_s
          g.set_attribute(DICT, 'mark', e['mark'])
          g.set_attribute(DICT, 'sec', e['sec'])
          g.set_attribute(DICT, 'u', e['u'])
        end
      end
      if data['marks']
        ml = layer(model, "#{TAG_FRAME}: марки")
        data['elems'].each do |e|
          a = nodes[e['i']]
          b = nodes[e['j']]
          t = root.entities.add_text(e['mark'].to_s, pt([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]))
          t.layer = ml
        end
      end
      steel = material(model, 'Каркас: сталь плит', [90, 100, 110])
      pl = root.entities.add_group
      pl.name = 'Опорні плити й анкери'
      pl.layer = layer(model, "#{TAG_FRAME}: опорні плити")
      (data['plates'] || []).each do |p|
        box(pl.entities, p['x'], p['y'], p['z'], p['B'], p['L'], p['t'], steel)
        (p['anchors'] || []).each { |dx, dy| rod(pl.entities, p['x'] + dx, p['y'] + dy, p['z'] + p['t'] + 0.04, p['d'], p['la'], steel) }
      end
      conc = material(model, 'Каркас: бетон', [190, 190, 185])
      conc.alpha = 0.6
      fg = root.entities.add_group
      fg.name = 'Фундаменти'
      fg.layer = layer(model, "#{TAG_FRAME}: фундаменти")
      (data['founds'] || []).each do |f|
        box(fg.entities, f['x'], f['y'], -(f['pedH'] + f['h']), f['B'], f['L'], f['h'], conc).name = "#{f['id']} плита"
        box(fg.entities, f['x'], f['y'], -f['pedH'], f['pedB'], f['pedL'], f['pedH'], conc).name = "#{f['id']} підколонник" if f['pedH'].to_f > 0
      end
      model.commit_operation
      js("SFC.built(#{data['elems'].size})")
    rescue StandardError => err
      model.abort_operation
      UI.messagebox("Не вдалося побудувати каркас: #{err.message}")
    end
  end

  # ---------------------------------------------------------------- файли (PDF, JSON, DXF зі звітів)
  def self.save_file(name, data, kind)
    path = UI.savepanel('Зберегти файл', '', name)
    return unless path
    bytes = kind == 'b64' ? Base64.decode64(data) : data
    File.binwrite(path, bytes)
  end

  # ---------------------------------------------------------------- меню й панель
  def self.cmd(text, tip, icon = nil, &blk)
    c = UI::Command.new(text, &blk)
    c.tooltip = tip
    c.status_bar_text = tip
    if icon
      c.small_icon = File.join(DIR, 'icons', "#{icon}_16.png")
      c.large_icon = File.join(DIR, 'icons', "#{icon}_24.png")
    end
    c
  end

  unless file_loaded?(__FILE__)
    cmds = [
      cmd('Відкрити розрахунок', 'Вікно розрахунку каркаса', 'open') { dialog },
      cmd('Взяти вибране як частини', 'Виділені групи/компоненти → частини скульптури', 'parts') { dialog; send_parts },
      cmd('Взяти лінії каркаса', "Лінії на тегах «#{TAG_FRAME}…» → стрижні", 'frame') { dialog; send_frame },
      cmd('Взяти гребінь шлейфу', "Лінії на тегах «#{TAG_RIDGE}…» → гребінь шлейфу", 'ridge') { dialog; send_ridge },
      cmd('Побудувати каркас у моделі', 'Труби, плити, анкери, фундаменти за останнім розрахунком', 'build') { dialog; js('SFC.sendBuild()') },
      cmd('Видалити побудований каркас', 'Видалити групу «Каркас (розрахунок)»') { clear_result }
    ]
    menu = UI.menu('Extensions').add_submenu('Каркас скульптури')
    cmds.each_with_index do |c, i|
      menu.add_separator if i == 5
      menu.add_item(c)
    end
    tb = UI::Toolbar.new('Каркас скульптури')
    cmds.first(5).each { |c| tb.add_item(c) }
    tb.restore
    file_loaded(__FILE__)
  end
end
