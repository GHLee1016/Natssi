"""
낯씨(natssi) 목업 씬 생성 스크립트 — Blender 4.2 이상 / 5.x

만드는 것
  - 폰 2대: 촬영·품질 검사 화면, 오늘의 판정 화면
  - 노트북 1대: 웹 타임라인 대시보드
  - 홈더마 디바이스 1개: 낯씨 LED 케어 디바이스(가상 제품) + 충전 독
  - 카메라 4개: hero(전체), phone, web, device

실행 방법
  1) 명령줄(전부 렌더):   blender -b -P natssi_mockup.py
  2) Blender MCP / 스크립팅 탭: ASSET_DIR를 screens 폴더가 있는 경로로 바꾼 뒤 실행.
     RENDER = False 이면 씬만 만들고 렌더는 하지 않습니다.
"""
import bpy, math, os
from mathutils import Vector

# ───────── 설정 ─────────
try:
    ASSET_DIR = os.path.dirname(os.path.abspath(__file__))
except NameError:
    ASSET_DIR = os.path.expanduser("~/natssi_mockup")   # MCP에서 실행할 때 여기 경로를 바꾸세요
SCREENS = os.path.join(ASSET_DIR, "screens")
OUT_DIR = os.path.join(ASSET_DIR, "renders")
RENDER = bool(bpy.app.background)      # 명령줄 실행이면 자동 렌더
SAMPLES = int(os.environ.get("NATSSI_SAMPLES", 96))
RES = (1920, 1080)

ORANGE = (1.0, 0.54, 0.40)      # #ff8a65
ORANGE_L = (1.0, 0.72, 0.42)    # #ffb86b
INK = (0.12, 0.165, 0.215)      # #1f2a37
BLUE = (0.56, 0.77, 0.91)       # #8ec5e8


def srgb(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


# ───────── 씬 초기화 ─────────
def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras,
                 bpy.data.lights, bpy.data.curves):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def link(obj, coll_name):
    coll = bpy.data.collections.get(coll_name) or bpy.data.collections.new(coll_name)
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


# ───────── 재질 ─────────
def principled(name, color, rough=0.4, metal=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(color), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    for key in ("Coat Weight", "Clearcoat"):
        if key in b.inputs:
            b.inputs[key].default_value = coat
            break
    return m


def emissive(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*srgb(color), 1)
    e.inputs["Strength"].default_value = strength
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def screen_mat(name, png, strength=1.0):
    """화면 이미지 → 발광 + 유리 반사. PNG 알파(둥근 모서리)는 베젤 검정으로 채움."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    path = os.path.join(SCREENS, png)
    if os.path.exists(path):
        tex.image = bpy.data.images.load(path)
    else:
        print("[natssi] 화면 이미지 없음:", path)
    tex.interpolation = "Cubic"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = strength * 0.85
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    glass = nt.nodes.new("ShaderNodeBsdfGlossy")
    glass.inputs["Roughness"].default_value = 0.05
    glass.inputs["Color"].default_value = (1, 1, 1, 1)
    fres = nt.nodes.new("ShaderNodeFresnel")
    fres.inputs["IOR"].default_value = 1.25
    add = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(fres.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(glass.outputs[0], add.inputs[2])
    black = nt.nodes.new("ShaderNodeBsdfPrincipled")
    black.inputs["Base Color"].default_value = (0.005, 0.005, 0.006, 1)
    black.inputs["Roughness"].default_value = 0.15
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(tex.outputs["Alpha"], mix.inputs[0])
    nt.links.new(black.outputs[0], mix.inputs[1])
    nt.links.new(add.outputs[0], mix.inputs[2])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(mix.outputs[0], out.inputs[0])
    return m


# ───────── 형태 헬퍼 ─────────
def rounded_box(name, size, bevel, segs=8, mat=None, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    md = o.modifiers.new("Bevel", "BEVEL")
    md.width = bevel
    md.segments = segs
    md.limit_method = "NONE"
    bpy.ops.object.shade_smooth()
    if mat:
        o.data.materials.append(mat)
    return o


def plane(name, w, h, mat, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (w / 2, h / 2, 1)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o


def parent(child, par):
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()


# ───────── 폰 ─────────
def make_phone(name, png, loc, rot_z_deg, tilt_deg=14):
    W, H, T = 0.0715, 0.147, 0.0083
    body = rounded_box(name, (W, T, H), 0.0095, 12, MAT["phone_frame"])
    # 화면은 앞면(-Y)에 세로로
    scr = plane(name + "_screen", W - 0.0045, H - 0.0045, screen_mat(name + "_scr", png, 1.15))
    scr.rotation_euler = (math.radians(90), 0, 0)
    scr.location = (0, -T / 2 - 0.0002, 0)
    parent(scr, body)
    # 카메라 섬(뒷면)
    cam = rounded_box(name + "_cambump", (0.03, 0.002, 0.03), 0.007, 6, MAT["phone_frame"],
                      loc=(-W / 2 + 0.019, T / 2 + 0.001, H / 2 - 0.019))
    parent(cam, body)
    body.location = Vector(loc) + Vector((0, 0, H / 2 * math.cos(math.radians(tilt_deg)) + 0.001))
    body.rotation_euler = (math.radians(-tilt_deg), 0, math.radians(rot_z_deg))
    # 받침대
    st = rounded_box(name + "_stand", (0.06, 0.05, 0.006), 0.003, 4, MAT["stand"],
                     loc=(loc[0], loc[1], 0.003))
    st.rotation_euler[2] = math.radians(rot_z_deg)
    for o in (body, scr, cam, st):
        link(o, "Phones")
    return body


# ───────── 노트북 ─────────
def make_laptop(loc, rot_z_deg=0):
    W, D, T = 0.31, 0.215, 0.011
    root = bpy.data.objects.new("Laptop", None)
    bpy.context.scene.collection.objects.link(root)
    base = rounded_box("Laptop_base", (W, D, T), 0.006, 6, MAT["alu"], loc=(0, 0, T / 2))
    deck = plane("Laptop_keyboard", W - 0.04, 0.10, MAT["key"], loc=(0, 0.02, T + 0.0003))
    pad = plane("Laptop_trackpad", 0.12, 0.07, MAT["alu_dark"], loc=(0, -0.065, T + 0.0003))
    lid = rounded_box("Laptop_lid", (W, 0.006, D - 0.005), 0.005, 6, MAT["alu"])
    bez = plane("Laptop_bezel", W - 0.008, D - 0.013, MAT["bezel"])
    bez.rotation_euler = (math.radians(90), 0, 0)
    bez.location = (0, -0.0031, 0)
    sw, sh = 0.29, 0.29 / 1.6
    scr = plane("Laptop_screen", sw, sh, screen_mat("web_scr", "screen_web.png", 1.0))
    scr.rotation_euler = (math.radians(90), 0, 0)
    scr.location = (0, -0.0033, 0.004)
    parent(bez, lid)
    parent(scr, lid)
    # 힌지 기준으로 열기(약 110°)
    open_deg = 102
    lid.rotation_euler = (-math.radians(open_deg - 90), 0, 0)
    a = math.radians(open_deg - 90)
    half = (D - 0.005) / 2
    lid.location = (0, D / 2 + math.sin(a) * half, T + math.cos(a) * half)
    for o in (base, deck, pad, lid):
        parent(o, root)
    for o in (base, deck, pad, lid, bez, scr):
        link(o, "Laptop")
    link(root, "Laptop")
    root.location = loc
    root.rotation_euler[2] = math.radians(rot_z_deg)
    return root


# ───────── 홈더마 디바이스 (가상 제품: 낯씨 LED 케어 디바이스) ─────────
def make_device(loc, rot_z_deg=0):
    root = bpy.data.objects.new("Device", None)
    bpy.context.scene.collection.objects.link(root)
    parts = []
    # 손잡이: 납작한 캡슐
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.0145, depth=0.12, location=(0, 0, 0))
    h = bpy.context.active_object
    h.name = "Device_handle"
    h.scale = (1, 0.72, 1)
    bpy.ops.object.transform_apply(scale=True)
    bv = h.modifiers.new("Bevel", "BEVEL"); bv.width = 0.012; bv.segments = 10; bv.limit_method = "ANGLE"
    bpy.ops.object.shade_smooth()
    h.data.materials.append(MAT["ceramic"])
    h.rotation_euler = (0, math.radians(90), 0)
    h.location = (-0.045, 0, 0.0135)
    parts.append(h)
    # 머리: 둥근 원반
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.036, depth=0.022, location=(0.04, 0, 0.016))
    hd = bpy.context.active_object
    hd.name = "Device_head"
    bv = hd.modifiers.new("Bevel", "BEVEL"); bv.width = 0.008; bv.segments = 10; bv.limit_method = "ANGLE"
    bpy.ops.object.shade_smooth()
    hd.data.materials.append(MAT["ceramic"])
    parts.append(hd)
    # 윗면 유리 + LED 링
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.028, depth=0.002, location=(0.04, 0, 0.0272))
    gl = bpy.context.active_object; gl.name = "Device_lens"
    bpy.ops.object.shade_smooth(); gl.data.materials.append(MAT["lens"]); parts.append(gl)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.0215, minor_radius=0.0016, major_segments=96,
                                     minor_segments=12, location=(0.04, 0, 0.0285))
    ring = bpy.context.active_object; ring.name = "Device_LED"
    bpy.ops.object.shade_smooth(); ring.data.materials.append(MAT["led"]); parts.append(ring)
    # LED 점 12개
    for i in range(12):
        ang = 2 * math.pi * i / 12
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.0014, depth=0.0006,
                                            location=(0.04 + 0.013 * math.cos(ang), 0.013 * math.sin(ang), 0.0287))
        d = bpy.context.active_object; d.name = f"Device_LEDdot{i}"
        d.data.materials.append(MAT["led_soft"]); parts.append(d)
    # 주황 포인트 띠
    bpy.ops.mesh.primitive_torus_add(major_radius=0.0362, minor_radius=0.0012, major_segments=96,
                                     minor_segments=8, location=(0.04, 0, 0.016))
    band = bpy.context.active_object; band.name = "Device_band"
    bpy.ops.object.shade_smooth(); band.data.materials.append(MAT["accent"]); parts.append(band)
    # 전원 버튼
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.0042, depth=0.003, location=(-0.016, 0, 0.0285))
    btn = bpy.context.active_object; btn.name = "Device_button"
    bv = btn.modifiers.new("Bevel", "BEVEL"); bv.width = 0.0012; bv.segments = 4
    bpy.ops.object.shade_smooth(); btn.data.materials.append(MAT["accent"]); parts.append(btn)
    # 로고
    bpy.ops.object.text_add(location=(-0.080, 0, 0.0283))
    tx = bpy.context.active_object; tx.name = "Device_logo"
    tx.data.body = "natssi"
    tx.data.size = 0.0085
    tx.data.extrude = 0.0002
    tx.data.align_x = "LEFT"; tx.data.align_y = "CENTER"
    tx.data.materials.append(MAT["logo"]); parts.append(tx)
    # 충전 독
    dock = rounded_box("Device_dock", (0.14, 0.06, 0.008), 0.004, 8, MAT["dock"], loc=(0, 0, -0.004))
    parts.append(dock)
    for p in parts:
        p.location.z += 0.008
        parent(p, root)
        link(p, "Device")
    link(root, "Device")
    root.location = loc
    root.rotation_euler[2] = math.radians(rot_z_deg)
    return root


# ───────── 조명·환경 ─────────
def area(name, loc, target, size, power, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, "AREA")
    d.size = size; d.energy = power; d.color = color
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    look_at(o, target)
    link(o, "Lights")
    return o


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def camera(name, loc, target, lens):
    c = bpy.data.cameras.new(name)
    c.lens = lens
    c.dof.use_dof = True
    c.dof.aperture_fstop = 11.0
    o = bpy.data.objects.new(name, c)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    look_at(o, target)
    c.dof.focus_distance = (Vector(target) - Vector(loc)).length
    link(o, "Cameras")
    return o


def world_and_floor():
    w = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (*srgb((0.97, 0.955, 0.94)), 1)
    bg.inputs[1].default_value = 0.14
    # 바닥 + 뒤 배경(곡면 사이클로라마)
    bpy.ops.mesh.primitive_plane_add(size=1)
    f = bpy.context.active_object; f.name = "Backdrop"
    f.scale = (3, 3, 1); bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in f.data.vertices:
        v.select = v.co.y > 0.5
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.extrude_region_move(TRANSFORM_OT_translate={"value": (0, 0, 2)})
    bpy.ops.object.mode_set(mode="OBJECT")
    f.location = (0, -0.1, 0)
    bv = f.modifiers.new("Bevel", "BEVEL"); bv.width = 0.8; bv.segments = 24; bv.limit_method = "ANGLE"
    bpy.ops.object.shade_smooth()
    f.data.materials.append(MAT["floor"])
    link(f, "Set")


# ───────── 렌더 설정 ─────────
def render_setup():
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.samples = SAMPLES
    s.cycles.use_denoising = True
    try:
        s.cycles.device = "GPU"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.get_devices()
        if not any(d.use for d in prefs.devices if d.type != "CPU"):
            s.cycles.device = "CPU"
    except Exception:
        s.cycles.device = "CPU"
    s.render.resolution_x, s.render.resolution_y = RES
    s.render.resolution_percentage = int(os.environ.get("NATSSI_SCALE", 100))
    s.render.film_transparent = False
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.render.image_settings.file_format = "PNG"


# ───────── 실행 ─────────
reset()
MAT = {
    "phone_frame": principled("PhoneFrame", (0.17, 0.18, 0.2), 0.25, 0.9),
    "stand": principled("Stand", (0.93, 0.92, 0.9), 0.55),
    "alu": principled("Aluminium", (0.42, 0.43, 0.46), 0.3, 1.0),
    "alu_dark": principled("AluDark", (0.36, 0.37, 0.40), 0.4, 1.0),
    "key": principled("Keys", (0.12, 0.12, 0.13), 0.6),
    "bezel": principled("Bezel", (0.01, 0.01, 0.012), 0.2),
    "ceramic": principled("Ceramic", (0.90, 0.89, 0.87), 0.3, 0.0, 0.5),
    "lens": principled("Lens", (0.10, 0.09, 0.09), 0.22, 0.0, 0.6),
    "led": emissive("LED", ORANGE, 6),
    "led_soft": emissive("LEDdot", (1.0, 0.35, 0.28), 8),
    "accent": principled("Accent", ORANGE, 0.35),
    "logo": principled("Logo", INK, 0.5),
    "dock": principled("Dock", (0.80, 0.78, 0.75), 0.6),
    "floor": principled("Floor", (0.84, 0.80, 0.76), 0.75),
}
render_setup()
world_and_floor()

make_laptop((0.03, 0.05, 0), rot_z_deg=-6)
make_phone("Phone_check", "screen_phone1.png", (-0.235, 0.0, 0), rot_z_deg=14)
make_phone("Phone_today", "screen_phone2.png", (-0.15, -0.09, 0), rot_z_deg=8)
make_device((0.23, -0.13, 0), rot_z_deg=-24)

area("Key", (-0.6, -0.7, 0.9), (0, 0, 0.05), 0.9, 24)
area("Fill", (0.8, -0.5, 0.5), (0, 0, 0.05), 1.2, 8, (1, 0.95, 0.9))
area("Rim", (0.2, 0.8, 0.7), (0, 0, 0.1), 0.8, 16, (0.9, 0.95, 1))

cams = {
    "hero":   camera("Cam_hero", (0.02, -0.84, 0.27), (0.0, -0.01, 0.09), 40),
    "phone":  camera("Cam_phone", (-0.12, -0.52, 0.15), (-0.19, -0.05, 0.08), 60),
    "web":    camera("Cam_web", (0.06, -0.42, 0.17), (0.04, 0.13, 0.11), 50),
    "device": camera("Cam_device", (0.33, -0.42, 0.17), (0.225, -0.13, 0.025), 60),
}
bpy.context.scene.camera = cams["hero"]

if RENDER:
    os.makedirs(OUT_DIR, exist_ok=True)
    only = os.environ.get("NATSSI_SHOTS")  # 예: NATSSI_SHOTS=hero,device
    for key, cam in cams.items():
        if only and key not in only.split(","):
            continue
        bpy.context.scene.camera = cam
        bpy.context.scene.render.filepath = os.path.join(OUT_DIR, f"natssi_{key}.png")
        bpy.ops.render.render(write_still=True)
        print("[natssi] 렌더 완료:", bpy.context.scene.render.filepath)
