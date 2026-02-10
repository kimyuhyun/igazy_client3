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

        // 3차 항: x0^3, x0^2*x1, x0^2*x2, x0*x1^2, x0*x1*x2, x0*x2^2, x1^3, x1^2*x2, x1*x2^2, x2^3
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

        return parseFloat(result.toFixed(2));
    }
}

// Python에서 생성된 모델 데이터를 직접 복사
const modelData = {
    coefficients: [
        0.0036179880257871254, -0.0017347365322471426, 0.018378830796216116, 0.009844353656393318, -0.04093657851410978,
        -0.03954126878975855, -0.05031747941628943, 0.056181539866987554, 0.002411567675431872, 0.0021403203870182146,
        -0.00788532977523059, 0.0009348781727291446, 0.010202561810903595, -0.0007709612024843336, 5.091744924179964e-5,
        -0.0026151744625798356, -0.0001886212006208042, -0.0001433607348478945, 8.3825419277323e-6,
    ],
    intercept: 23.4649223050914,
    degree: 3,
    feature_names: [
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
        "delta_x^3",
    ],
    train_r2: 0.9989553291383466,
    test_r2: 0.9966832881716564,
};

const calculator = new RegressionEyeAngleCalculator(modelData);
export default calculator;

/*
// 사용 예시
import calculator from './RegressionEyeAngleCalculator.js';

const angle = calculator.calculateEyeAngle(27.9, 31, -37.0);
console.log(`예측 각도: ${angle}°`); // 19.44°
*/
