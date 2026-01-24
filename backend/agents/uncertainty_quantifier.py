import numpy as np
from typing import Dict, Any, Tuple, List
import logging
from scipy import stats, spatial
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, WhiteKernel
import warnings

warnings.filterwarnings('ignore')
logger = logging.getLogger(__name__)

class UncertaintyQuantifier:
    """
    Quantificateur d'incertitude avancé pour les simulations thermiques.
    Combine plusieurs méthodes pour une estimation robuste.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        
        self.methods = [
            'variance_based',
            'physics_residual',
            'ensemble',
            'gaussian_process',
            'spatial_correlation'
        ]
        
        self.method_weights = {
            'variance_based': 0.25,
            'physics_residual': 0.30,
            'ensemble': 0.20,
            'gaussian_process': 0.15,
            'spatial_correlation': 0.10
        }
        
        self.gp_model = None
        self.gp_trained = False
        
        self.uncertainty_history = []
        self.calibration_factors = []
        
        logger.info("Quantificateur d'incertitude initialisé")
    
    def quantify(self, 
                prediction: np.ndarray, 
                physics_residual: float,
                additional_data: Dict[str, Any] = None) -> float:
        """
        Quantifie l'incertitude totale en combinant plusieurs méthodes.
        """
        
        if additional_data is None:
            additional_data = {}
        
        uncertainty_scores = {}
        
        variance_score = self._variance_based_uncertainty(prediction)
        uncertainty_scores['variance_based'] = variance_score
        
        physics_score = self._physics_based_uncertainty(physics_residual, prediction)
        uncertainty_scores['physics_residual'] = physics_score
        
        if 'ensemble_predictions' in additional_data:
            ensemble_score = self._ensemble_uncertainty(
                additional_data['ensemble_predictions']
            )
            uncertainty_scores['ensemble'] = ensemble_score
        else:
            uncertainty_scores['ensemble'] = (variance_score + physics_score) / 2
        
        gp_score = self._gaussian_process_uncertainty(prediction, additional_data)
        uncertainty_scores['gaussian_process'] = gp_score
        
        if 'spatial_coordinates' in additional_data:
            spatial_score = self._spatial_correlation_uncertainty(
                prediction, 
                additional_data['spatial_coordinates']
            )
            uncertainty_scores['spatial_correlation'] = spatial_score
        else:
            spatial_score = 0.5 * (variance_score + physics_score)
            uncertainty_scores['spatial_correlation'] = spatial_score
        
        total_uncertainty = 0.0
        total_weight = 0.0
        
        for method, score in uncertainty_scores.items():
            weight = self.method_weights.get(method, 0.0)
            total_uncertainty += weight * score
            total_weight += weight
        
        if total_weight > 0:
            total_uncertainty /= total_weight
        
        calibrated_uncertainty = self._apply_calibration(total_uncertainty, prediction)
        
        self.uncertainty_history.append({
            'timestamp': np.datetime64('now'),
            'uncertainty_scores': uncertainty_scores,
            'total_uncertainty': calibrated_uncertainty,
            'prediction_stats': {
                'mean': float(np.mean(prediction)),
                'std': float(np.std(prediction)),
                'min': float(np.min(prediction)),
                'max': float(np.max(prediction))
            }
        })
        
        if len(self.uncertainty_history) > 1000:
            self.uncertainty_history = self.uncertainty_history[-1000:]
        
        return float(calibrated_uncertainty)
    
    def _variance_based_uncertainty(self, prediction: np.ndarray) -> float:
        if len(prediction) < 2:
            return 0.5
        
        variance = np.var(prediction)
        mean = np.mean(prediction)
        
        if mean == 0:
            return min(1.0, variance)
        
        cv = np.sqrt(variance) / abs(mean)
        cv_score = min(1.0, cv)
        
        try:
            skewness = stats.skew(prediction)
            kurtosis = stats.kurtosis(prediction)
            normality_score = (abs(skewness) + abs(kurtosis - 3)) / 10
            normality_score = min(1.0, max(0.0, normality_score))
        except:
            normality_score = 0.5
        
        uncertainty = 0.7 * cv_score + 0.3 * normality_score
        
        return float(uncertainty)
    
    def _physics_based_uncertainty(self, 
                                  physics_residual: float, 
                                  prediction: np.ndarray) -> float:
        residual_score = min(1.0, physics_residual / 10.0)
        
        physical_bounds_violation = 0.0
        
        negative_temp = np.sum(prediction < 0)
        if negative_temp > 0:
            physical_bounds_violation += 0.3
        
        extreme_temp = np.sum(prediction > 1000)
        if extreme_temp > 0:
            physical_bounds_violation += 0.4
        
        if len(prediction) > 1:
            gradients = np.diff(prediction)
            extreme_gradients = np.sum(np.abs(gradients) > 100)
            if extreme_gradients > 0:
                physical_bounds_violation += 0.3
        
        physical_bounds_violation = min(1.0, physical_bounds_violation)
        
        uncertainty = 0.6 * residual_score + 0.4 * physical_bounds_violation
        
        return float(uncertainty)
    
    def _ensemble_uncertainty(self, ensemble_predictions: List[np.ndarray]) -> float:
        if not ensemble_predictions:
            return 0.5
        
        n_models = len(ensemble_predictions)
        
        if n_models < 2:
            return 0.5
        
        ensemble_array = np.array(ensemble_predictions)
        
        epistemic_variance = np.var(ensemble_array, axis=0)
        epistemic_uncertainty = np.mean(epistemic_variance)
        
        aleatoric_variance = np.mean([np.var(pred) for pred in ensemble_predictions])
        
        total_variance = 0.7 * epistemic_uncertainty + 0.3 * aleatoric_variance
        
        uncertainty = min(1.0, total_variance / 100.0)
        
        return float(uncertainty)
    
    def _gaussian_process_uncertainty(self, 
                                     prediction: np.ndarray,
                                     additional_data: Dict[str, Any]) -> float:
        if 'training_data' not in additional_data or 'training_targets' not in additional_data:
            return self._variance_based_uncertainty(prediction)
        
        X_train = additional_data['training_data']
        y_train = additional_data['training_targets']
        
        if len(X_train) < 10 or len(y_train) < 10:
            return 0.5
        
        try:
            if not self.gp_trained or self.gp_model is None:
                kernel = 1.0 * RBF(length_scale=1.0) + WhiteKernel(noise_level=0.1)
                self.gp_model = GaussianProcessRegressor(
                    kernel=kernel,
                    n_restarts_optimizer=5,
                    random_state=42
                )
                
                self.gp_model.fit(X_train, y_train)
                self.gp_trained = True
            
            if 'test_data' in additional_data:
                X_test = additional_data['test_data']
            else:
                n_points = len(prediction)
                X_test = np.column_stack([
                    np.linspace(0, 1, n_points),
                    prediction,
                    np.random.randn(n_points) * 0.1
                ])
            
            y_pred, y_std = self.gp_model.predict(X_test, return_std=True)
            
            gp_uncertainty = np.mean(y_std)
            uncertainty = min(1.0, gp_uncertainty / 10.0)
            
            return float(uncertainty)
            
        except Exception as e:
            logger.warning(f"Erreur GP: {str(e)}")
            return 0.5
    
    def _spatial_correlation_uncertainty(self, 
                                        prediction: np.ndarray,
                                        coordinates: np.ndarray) -> float:
        if len(prediction) < 2 or coordinates.shape[0] < 2:
            return 0.5
        
        try:
            if len(prediction) > 10:
                spatial_corr = self._compute_spatial_autocorrelation(
                    prediction, 
                    coordinates
                )
                
                uncertainty = 1.0 - abs(spatial_corr)
                
                return float(max(0.0, min(1.0, uncertainty)))
            else:
                return 0.5
                
        except Exception as e:
            logger.warning(f"Erreur corrélation spatiale: {str(e)}")
            return 0.5
    
    def _compute_spatial_autocorrelation(self, 
                                        values: np.ndarray,
                                        coordinates: np.ndarray) -> float:
        n = len(values)
        if n < 3:
            return 0.0
        
        dist_matrix = spatial.distance_matrix(coordinates, coordinates)
        
        with np.errstate(divide='ignore', invalid='ignore'):
            weight_matrix = 1.0 / (dist_matrix + np.eye(n) * 1e-10)
            weight_matrix[np.isinf(weight_matrix)] = 0.0
        
        row_sums = weight_matrix.sum(axis=1)
        weight_matrix = weight_matrix / row_sums[:, np.newaxis]
        
        mean_val = np.mean(values)
        deviations = values - mean_val
        
        numerator = 0.0
        denominator = 0.0
        
        for i in range(n):
            for j in range(n):
                if i != j:
                    numerator += weight_matrix[i, j] * deviations[i] * deviations[j]
            denominator += deviations[i] ** 2
        
        if denominator == 0:
            return 0.0
        
        moran_i = (n / np.sum(weight_matrix)) * (numerator / denominator)
        
        return float(moran_i)
    
    def _apply_calibration(self, 
                          uncertainty: float, 
                          prediction: np.ndarray) -> float:
        calibrated = uncertainty
        
        if self.calibration_factors:
            hist_factor = np.mean(self.calibration_factors[-10:])
            calibrated = 0.8 * calibrated + 0.2 * hist_factor
        
        prediction_factor = self._compute_prediction_confidence(prediction)
        calibrated = 0.7 * calibrated + 0.3 * prediction_factor
        
        self.calibration_factors.append(calibrated)
        if len(self.calibration_factors) > 100:
            self.calibration_factors = self.calibration_factors[-100:]
        
        return float(min(1.0, max(0.0, calibrated)))
    
    def _compute_prediction_confidence(self, prediction: np.ndarray) -> float:
        if len(prediction) < 5:
            return 0.5
        
        confidence_factors = []
        
        rolling_std = np.std(np.lib.stride_tricks.sliding_window_view(prediction, 5), axis=1)
        if len(rolling_std) > 0:
            stability = 1.0 - np.mean(rolling_std) / (np.std(prediction) + 1e-10)
            confidence_factors.append(max(0.0, min(1.0, stability)))
        
        try:
            _, normality_p = stats.normaltest(prediction)
            normality_confidence = min(1.0, normality_p * 10)
            confidence_factors.append(normality_confidence)
        except:
            confidence_factors.append(0.5)
        
        q1, q3 = np.percentile(prediction, [25, 75])
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        
        outliers = np.sum((prediction < lower_bound) | (prediction > upper_bound))
        outlier_ratio = outliers / len(prediction)
        outlier_confidence = 1.0 - outlier_ratio
        confidence_factors.append(max(0.0, outlier_confidence))
        
        if confidence_factors:
            return float(np.mean(confidence_factors))
        else:
            return 0.5
    
    def get_uncertainty_breakdown(self, 
                                 prediction: np.ndarray, 
                                 physics_residual: float,
                                 additional_data: Dict[str, Any] = None) -> Dict[str, float]:
        if additional_data is None:
            additional_data = {}
        
        breakdown = {}
        
        breakdown['variance_based'] = self._variance_based_uncertainty(prediction)
        breakdown['physics_residual'] = self._physics_based_uncertainty(
            physics_residual, prediction
        )
        
        if 'ensemble_predictions' in additional_data:
            breakdown['ensemble'] = self._ensemble_uncertainty(
                additional_data['ensemble_predictions']
            )
        else:
            breakdown['ensemble'] = np.mean([breakdown['variance_based'], 
                                            breakdown['physics_residual']])
        
        breakdown['gaussian_process'] = self._gaussian_process_uncertainty(
            prediction, additional_data
        )
        
        if 'spatial_coordinates' in additional_data:
            breakdown['spatial_correlation'] = self._spatial_correlation_uncertainty(
                prediction, additional_data['spatial_coordinates']
            )
        else:
            breakdown['spatial_correlation'] = np.mean([
                breakdown['variance_based'], 
                breakdown['physics_residual']
            ])
        
        total_score = 0.0
        total_weight = 0.0
        
        for method, score in breakdown.items():
            weight = self.method_weights.get(method, 0.0)
            total_score += weight * score
            total_weight += weight
        
        if total_weight > 0:
            breakdown['total_uncertainty'] = total_score / total_weight
            breakdown['calibrated_uncertainty'] = self._apply_calibration(
                breakdown['total_uncertainty'], prediction
            )
        else:
            breakdown['total_uncertainty'] = 0.5
            breakdown['calibrated_uncertainty'] = 0.5
        
        return breakdown
    
    def calibrate_with_ground_truth(self, 
                                   predictions: List[np.ndarray],
                                   ground_truths: List[np.ndarray]):
        if len(predictions) != len(ground_truths):
            logger.error("Les listes doivent avoir la même longueur")
            return
        
        calibration_data = []
        
        for pred, truth in zip(predictions, ground_truths):
            if len(pred) != len(truth):
                continue
            
            errors = np.abs(pred - truth)
            mae = np.mean(errors)
            
            physics_residual = mae
            uncertainty = self.quantify(pred, physics_residual)
            
            calibration_data.append({
                'uncertainty': uncertainty,
                'error': mae,
                'coverage': np.mean(errors < 2 * uncertainty * np.std(pred))
            })
        
        if calibration_data:
            uncertainties = [d['uncertainty'] for d in calibration_data]
            errors = [d['error'] for d in calibration_data]
            
            if len(uncertainties) > 1:
                try:
                    slope, intercept, r_value, _, _ = stats.linregress(
                        uncertainties, errors
                    )
                    
                    logger.info(f"Calibration terminée: R² = {r_value**2:.4f}")
                    
                except Exception as e:
                    logger.warning(f"Erreur lors de la calibration: {str(e)}")
    
    def _update_method_weights(self, calibration_data: List[Dict[str, float]]):
        pass
    
    def get_statistics(self) -> Dict[str, Any]:
        if not self.uncertainty_history:
            return {
                'total_quantifications': 0,
                'avg_uncertainty': 0.0,
                'uncertainty_trend': 'insufficient_data'
            }
        
        uncertainties = [h['total_uncertainty'] for h in self.uncertainty_history]
        
        if len(uncertainties) > 10:
            try:
                x = np.arange(len(uncertainties))
                slope, _, _, _, _ = stats.linregress(x, uncertainties)
                
                if slope > 0.001:
                    trend = 'increasing'
                elif slope < -0.001:
                    trend = 'decreasing'
                else:
                    trend = 'stable'
            except:
                trend = 'unknown'
        else:
            trend = 'insufficient_data'
        
        return {
            'total_quantifications': len(self.uncertainty_history),
            'avg_uncertainty': float(np.mean(uncertainties)),
            'std_uncertainty': float(np.std(uncertainties)),
            'min_uncertainty': float(np.min(uncertainties)),
            'max_uncertainty': float(np.max(uncertainties)),
            'uncertainty_trend': trend,
            'calibration_factors_count': len(self.calibration_factors),
            'avg_calibration_factor': float(np.mean(self.calibration_factors)) 
                if self.calibration_factors else 0.0
        }

if __name__ == "__main__":
    quantifier = UncertaintyQuantifier()
    
    n_points = 1000
    prediction = np.random.normal(50, 10, n_points)
    physics_residual = 2.5
    
    additional_data = {
        'spatial_coordinates': np.random.randn(n_points, 3),
        'ensemble_predictions': [
            prediction + np.random.normal(0, 1, n_points),
            prediction + np.random.normal(0, 2, n_points),
            prediction + np.random.normal(0, 1.5, n_points)
        ]
    }
    
    uncertainty = quantifier.quantify(prediction, physics_residual, additional_data)
    print(f"Incertitude totale : {uncertainty:.4f}")
