// 눈 각도 계산 모델 (보간 데이터 포함)
// Train R²: 0.9908, Test R²: 0.9858
// 원본: 84개 → 보간 후: 732개

class RegressionEyeAngleCalculator {
    constructor(modelData) {
        this.coefficients = modelData.coefficients;
        this.intercept = modelData.intercept;
        this.degree = modelData.degree;
    }

    polynomialFeatures(cam_angle, distance, delta_x) {
        const features = [];
        const x = [cam_angle, distance, Math.abs(delta_x)];

        // 1차 항
        features.push(...x);

        // 2차 항
        for (let i = 0; i < 3; i++) {
            for (let j = i; j < 3; j++) {
                features.push(x[i] * x[j]);
            }
        }

        return features;
    }

    calculateEyeAngle(cam_angle, distance, delta_x) {
        const features = this.polynomialFeatures(cam_angle, distance, delta_x);

        let result = this.intercept;
        for (let i = 0; i < features.length; i++) {
            result += this.coefficients[i] * features[i];
        }

        return parseFloat(result.toFixed(1));
    }
}

const modelData = {
    "coefficients": [
        -2.2387824844363826,
        3.979322228739907,
        -0.7912247841309185,
        0.03231470827124965,
        0.003903178090166144,
        0.010904810365084418,
        -0.07413295152308078,
        0.03183824148301351,
        0.00037495198198095824
    ],
    "intercept": -18.30161180756047,
    "degree": 2,
    "feature_names": [
        "cam_angle",
        "distance",
        "delta_x",
        "cam_angle^2",
        "cam_angle distance",
        "cam_angle delta_x",
        "distance^2",
        "distance delta_x",
        "delta_x^2"
    ],
    "train_r2": 0.9907935221674912,
    "test_r2": 0.9858382868942737,
    "best_alpha": 0.1,
    "data_info": {
        "original_samples": 84,
        "interpolated_samples": 732,
        "final_samples": 720
    }
};

const calculator = new RegressionEyeAngleCalculator(modelData);
export default calculator;

/*
사용 예시:
const angle = calculator.calculateEyeAngle(34.6, 30, 12.13);
console.log(`예측 각도: ${angle}°`);
*/
