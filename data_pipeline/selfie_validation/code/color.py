"""색 변환: sRGB(8bit) → CIELAB(D65). 낯씨 붉은기 지표는 a*(초록←→빨강 축)입니다."""
import numpy as np

# sRGB → XYZ (D65), IEC 61966-2-1
_M = np.array([[0.4124564, 0.3575761, 0.1804375],
               [0.2126729, 0.7151522, 0.0721750],
               [0.0193339, 0.1191920, 0.9503041]])
_WHITE = np.array([0.95047, 1.0, 1.08883])          # D65 기준 백색


def srgb_to_linear(rgb8):
    c = np.asarray(rgb8, dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb_to_lab(rgb8):
    """(..., 3) uint8 sRGB → (..., 3) L*, a*, b*"""
    xyz = srgb_to_linear(rgb8) @ _M.T / _WHITE
    eps, kappa = 216 / 24389, 24389 / 27
    f = np.where(xyz > eps, np.cbrt(xyz), (kappa * xyz + 16) / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)
