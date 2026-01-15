import numpy as np
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
import json
from datetime import datetime

# 1. JSON 파일 로드
with open('x_axis_calibration_data.json', 'r', encoding='utf-8') as f:
    calibration_data = json.load(f)

# 2. 데이터 준비
X = []  # [cam_angle, distance, delta_x]
y = []  # [eye_angle]

for cam_angle_str, dist_data in calibration_data.items():
    for distance_str, angle_data in dist_data.items():
        for eye_angle_str, delta_x_str in angle_data.items():
            X.append([
                float(cam_angle_str), 
                float(distance_str), 
                abs(float(delta_x_str))  # delta_x 절대값
            ])
            y.append(float(eye_angle_str))  # eye_angle

X = np.array(X)
y = np.array(y)

print(f"📊 총 데이터: {len(X)}개")

# 3. 다항 특징 생성 (3차)
poly = PolynomialFeatures(degree=3, include_bias=False)
X_poly = poly.fit_transform(X)

print(f"📐 특징 수: {X_poly.shape[1]}개")

# 4. 학습/테스트 분리
X_train, X_test, y_train, y_test = train_test_split(
    X_poly, y, test_size=0.2, random_state=42
)

# 5. 최적 alpha 찾기
best_alpha = 1.0
best_test_score = -np.inf

print("\n🔍 최적 alpha 탐색:")
for alpha in [0.1, 0.5, 1.0, 2.0, 5.0, 10.0]:
    model = Ridge(alpha=alpha)
    model.fit(X_train, y_train)
    
    train_score = model.score(X_train, y_train)
    test_score = model.score(X_test, y_test)
    
    print(f"   alpha={alpha:5.1f}: Train R²={train_score:.4f}, Test R²={test_score:.4f}")
    
    if test_score > best_test_score:
        best_test_score = test_score
        best_alpha = alpha

print(f"\n✅ 최적 alpha: {best_alpha}")

# 6. 최종 모델 학습
model = Ridge(alpha=best_alpha)
model.fit(X_train, y_train)

# 7. 평가
train_score = model.score(X_train, y_train)
test_score = model.score(X_test, y_test)

print(f"\n📈 최종 모델 성능:")
print(f"   Train R²: {train_score:.4f}")
print(f"   Test R²: {test_score:.4f}")

# 8. 예측 테스트
test_cases = [
    [34.6, 30, 5.3],   # 6° 예상
    [34.6, 30, 11.7],  # 12° 예상
    [34.6, 30, 20.1],  # 18° 예상
    [34.6, 30, 25.4],  # 24° 예상
    [30.0, 30, 10.0],
    [30.0, 30, 20.0],
    [32.0, 28, 15.0],
]

print("\n🧪 예측 테스트:")
for test_input in test_cases:
    test_poly = poly.transform([test_input])
    predicted = model.predict(test_poly)
    print(f"   cam={test_input[0]}°, dist={test_input[1]}mm, Δx={test_input[2]}px → {predicted[0]:.2f}°")

# 9. JSON 파일로 저장
model_data = {
    'coefficients': model.coef_.tolist(),
    'intercept': float(model.intercept_),
    'degree': 3,
    'best_alpha': float(best_alpha),
    'feature_names': poly.get_feature_names_out(['cam_angle', 'distance', 'delta_x']).tolist(),
    'train_r2': float(train_score),
    'test_r2': float(test_score),
    'data_samples': int(len(X))
}

with open('eye_angle_model.json', 'w', encoding='utf-8') as f:
    json.dump(model_data, f, indent=2, ensure_ascii=False)

print("\n✅ 모델 저장: eye_angle_model.json")

now = datetime.now()

# 10. JavaScript 코드 생성
js_code = f"""// 눈 각도 계산 모델
// Train R²: {train_score:.4f}, Test R²: {test_score:.4f}
// Alpha: {best_alpha}, Samples: {len(X)}

class RegressionEyeAngleCalculator {{
    constructor(modelData) {{
        this.coefficients = modelData.coefficients;
        this.intercept = modelData.intercept;
        this.degree = modelData.degree;
    }}

    // 3차 다항 특징 생성
    polynomialFeatures(cam_angle, distance, delta_x) {{
        const features = [];
        const x = [cam_angle, distance, Math.abs(delta_x)];

        // 1차 항: x0, x1, x2
        features.push(...x);

        // 2차 항: x0^2, x0*x1, x0*x2, x1^2, x1*x2, x2^2
        for (let i = 0; i < 3; i++) {{
            for (let j = i; j < 3; j++) {{
                features.push(x[i] * x[j]);
            }}
        }}

        // 3차 항
        for (let i = 0; i < 3; i++) {{
            for (let j = i; j < 3; j++) {{
                for (let k = j; k < 3; k++) {{
                    features.push(x[i] * x[j] * x[k]);
                }}
            }}
        }}

        return features;
    }}

    calculateEyeAngle(cam_angle, distance, delta_x) {{
        const features = this.polynomialFeatures(cam_angle, distance, delta_x);

        let result = this.intercept;
        for (let i = 0; i < features.length; i++) {{
            result += this.coefficients[i] * features[i];
        }}

        return parseFloat(result.toFixed(1));
    }}
}}

const modelData = {json.dumps(model_data, indent=4)};

const calculator = new RegressionEyeAngleCalculator(modelData);
export default calculator;

/*
사용 예시:
import calculator from './RegressionEyeAngleCalculator.js';

const angle = calculator.calculateEyeAngle(34.6, 30, 12.13);
console.log(`예측 각도: ${{angle}}°`);
{now.strftime("%Y-%m-%d %H:%M:%S")} 생성
*/
"""

with open('./src/utils/RegressionEyeAngleCalculator.js', 'w', encoding='utf-8') as f:
    f.write(js_code)

print("✅ JavaScript 생성: RegressionEyeAngleCalculator.js")
print("\n🎉 완료!")