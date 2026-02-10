// 눈 각도 계산 모델
// Train R²: 0.9982, Test R²: 0.9964
// Alpha: 0.1, Samples: 66

class RegressionEyeAngleCalculator {
    constructor(modelData) {
        this.coefficients = modelData.coefficients;
        this.intercept = modelData.intercept;
        this.degree = modelData.degree;
    }

    // 3차 다항 특징 생성
    polynomialFeatures(cam_angle, distance, delta_x) {
        const features = [];
        const x = [cam_angle, distance, Math.abs(delta_x)];

        // 1차 항: x0, x1, x2
        features.push(...x);

        // 2차 항: x0^2, x0*x1, x0*x2, x1^2, x1*x2, x2^2
        for (let i = 0; i < 3; i++) {
            for (let j = i; j < 3; j++) {
                features.push(x[i] * x[j]);
            }
        }

        // 3차 항
        for (let i = 0; i < 3; i++) {
            for (let j = i; j < 3; j++) {
                for (let k = j; k < 3; k++) {
                    features.push(x[i] * x[j] * x[k]);
                }
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
        0.05254387061234375,
        -0.028742627008759188,
        -0.17877073760540407,
        -0.66683245240096,
        1.5382806906485866,
        -0.07544195012160597,
        -0.695946743790273,
        0.08995792712135837,
        0.0047060259149694535,
        0.009585340778036262,
        -0.008874311239509611,
        0.0009451311660494132,
        -0.017984396373082957,
        0.0008761458156192285,
        -9.395471777929276e-05,
        0.013372397837818562,
        -0.0015732458508927035,
        -5.19334223107604e-05,
        4.200015984722308e-06
    ],
    "intercept": -52.95494873092329,
    "degree": 3,
    "best_alpha": 0.1,
    "feature_names": [
        "cam_angle",
        "distance",
        "delta_x",
        "cam_angle^2",
        "cam_angle distance",
        "cam_angle delta_x",
        "distance^2",
        "distance delta_x",
        "delta_x^2",
        "cam_angle^3",
        "cam_angle^2 distance",
        "cam_angle^2 delta_x",
        "cam_angle distance^2",
        "cam_angle distance delta_x",
        "cam_angle delta_x^2",
        "distance^3",
        "distance^2 delta_x",
        "distance delta_x^2",
        "delta_x^3"
    ],
    "train_r2": 0.9982390522219524,
    "test_r2": 0.9963520623487566,
    "data_samples": 66
};

const calculator = new RegressionEyeAngleCalculator(modelData);
export default calculator;

/*
사용 예시:
import calculator from './RegressionEyeAngleCalculator.js';

const angle = calculator.calculateEyeAngle(34.6, 30, 12.13);
console.log(`예측 각도: ${angle}°`);
2025-12-18 14:42:45 생성
*/
