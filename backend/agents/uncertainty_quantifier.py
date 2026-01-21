import numpy as np

class UncertaintyQuantifier:
    """
    Quantifie l'incertitude de la simulation en comparant 
    les prédictions du PINN avec les lois physiques.
    """
    def quantify(self, prediction: np.ndarray, physics_residual: float):
        variance = np.var(prediction)
        score = (variance * 0.1) + (physics_residual * 0.9)
        return min(1.0, score)
