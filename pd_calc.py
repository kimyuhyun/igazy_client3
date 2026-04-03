import math

# =====================
# 입력값 (하드코딩)
# =====================
limbus_mm          = 12.5       # 윤부 실제 지름 (mm)
limbus_px          = 196.0      # 윤부 화면상 수평 지름 (px)
cam_angle_deg      = 37.6       # 카메라 기울기 각도 (°)
delta_x            = 25    # 동공 이동 픽셀 (x축)
delta_y            = 0          # 동공 이동 픽셀 (y축)
R_eye              = 13.0       # 안구 회전 반경 (mm, 생리학적 표준값)

# =====================
# 계산
# =====================
mm_per_px = limbus_mm / limbus_px
cos_a     = math.cos(math.radians(cam_angle_deg))

x_mm      = delta_x * mm_per_px            # x: 카메라 기울기 보정 불필요
y_mm      = delta_y * mm_per_px / cos_a    # y: 카메라 각도(cos)로 보정

disp_mm   = math.sqrt(x_mm**2 + y_mm**2)
angle_deg = math.degrees(math.asin(min(disp_mm / R_eye, 1.0)))
angle_rad = math.radians(angle_deg) 
pd        = 100 * math.tan(angle_rad)      # Prism Diopter = 100 × tan(θ)
 
# =====================
# 출력
# =====================
print(f"mm_per_px      : {mm_per_px:.6f} mm/px")
print(f"x_mm           : {x_mm:.4f} mm")
print(f"y_mm           : {y_mm:.4f} mm")
print(f"displacement   : {disp_mm:.4f} mm")
print(f"angle          : {angle_deg:.4f} °")
print(f"PD             : {pd:.4f} prism diopters")
