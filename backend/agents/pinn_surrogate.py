import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from typing import List, Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)

class PhysicsInformedNN(nn.Module):
    """Réseau de neurones informé par la physique pour le transfert thermique"""
    
    def __init__(self, input_dim: int = 3, hidden_layers: List[int] = [64, 128, 64]):
        super(PhysicsInformedNN, self).__init__()
        
        layers = []
        prev_dim = input_dim
        
        # Construction des couches cachées
        for hidden_dim in hidden_layers:
            layers.append(nn.Linear(prev_dim, hidden_dim))
            layers.append(nn.ReLU())
            layers.append(nn.BatchNorm1d(hidden_dim))
            layers.append(nn.Dropout(0.1))
            prev_dim = hidden_dim
        
        # Couche de sortie
        layers.append(nn.Linear(prev_dim, 1))
        
        self.model = nn.Sequential(*layers)
        
        # Initialisation des poids
        self._initialize_weights()
    
    def _initialize_weights(self):
        """Initialisation Xavier/Glorot pour une convergence rapide"""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_normal_(module.weight)
                nn.init.constant_(module.bias, 0.0)
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.model(x)
    
    def physics_loss(self, x: torch.Tensor, y: torch.Tensor, 
                    conductivity: float, density: float, specific_heat: float) -> torch.Tensor:
        """
        Calcul de la perte physique basée sur l'équation de la chaleur:
        ρ * c_p * ∂T/∂t = k * ∇²T + Q
        """
        # Calcul des gradients pour le Laplacien
        x.requires_grad_(True)
        
        # Température prédite
        T = self.forward(x)
        
        # Gradient premier
        grad_T = torch.autograd.grad(
            T, x, 
            grad_outputs=torch.ones_like(T),
            create_graph=True,
            retain_graph=True
        )[0]
        
        # Laplacien (divergence du gradient)
        laplacian_T = torch.zeros_like(T)
        for i in range(x.shape[1]):
            grad_T_i = torch.autograd.grad(
                grad_T[:, i], x,
                grad_outputs=torch.ones_like(grad_T[:, i]),
                create_graph=True,
                retain_graph=True
            )[0][:, i]
            laplacian_T += grad_T_i
        
        # Équation de la chaleur résiduelle
        heat_eq_residual = density * specific_heat * grad_T[:, 0] - conductivity * laplacian_T
        
        # Perte MSE sur l'équation physique
        physics_loss = torch.mean(heat_eq_residual**2)
        
        return physics_loss

class PINNSurrogate:
    """
    Modèle de substitution Physics-Informed Neural Network.
    Contraint par les équations de transfert thermique.
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Architecture du réseau
        hidden_layers = config.get("hidden_layers", [64, 128, 64])
        self.model = PhysicsInformedNN(input_dim=3, hidden_layers=hidden_layers).to(self.device)
        
        # Optimiseur
        self.learning_rate = config.get("learning_rate", 1e-3)
        self.optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)
        
        # Métriques
        self.fidelity_score = 0.98
        self.training_history = []
        self.validation_loss = float('inf')
        
        # Paramètres physiques par défaut
        self.conductivity = 200.0
        self.density = 2700.0
        self.specific_heat = 900.0
        
        logger.info(f"PINN initialisé sur {self.device}")
    
    def predict(self, geometry_data: np.ndarray) -> np.ndarray:
        """
        Inférence rapide du champ de température.
        
        Args:
            geometry_data: Données géométriques [n_points, 3]
            
        Returns:
            Température prédite pour chaque point
        """
        self.model.eval()
        
        with torch.no_grad():
            # Conversion en tensor
            x_tensor = torch.FloatTensor(geometry_data).to(self.device)
            
            # Prédiction
            predictions = self.model(x_tensor)
            
            # Post-traitement: application de contraintes physiques
            predictions = self._apply_physical_constraints(predictions)
            
            return predictions.cpu().numpy().flatten()
    
    def train(self, training_data: Dict[str, np.ndarray], 
              validation_data: Dict[str, np.ndarray],
              epochs: int = 100,
              batch_size: int = 32) -> Dict[str, List[float]]:
        """
        Entraînement du modèle PINN.
        
        Args:
            training_data: {'geometry': X_train, 'temperature': y_train}
            validation_data: {'geometry': X_val, 'temperature': y_val}
            epochs: Nombre d'époques
            batch_size: Taille des batches
            
        Returns:
            Historique d'entraînement
        """
        self.model.train()
        
        # Préparation des données
        X_train = torch.FloatTensor(training_data['geometry']).to(self.device)
        y_train = torch.FloatTensor(training_data['temperature']).to(self.device)
        
        X_val = torch.FloatTensor(validation_data['geometry']).to(self.device)
        y_val = torch.FloatTensor(validation_data['temperature']).to(self.device)
        
        history = {
            'train_loss': [],
            'val_loss': [],
            'physics_loss': [],
            'data_loss': []
        }
        
        n_samples = X_train.shape[0]
        n_batches = (n_samples + batch_size - 1) // batch_size
        
        for epoch in range(epochs):
            epoch_train_loss = 0.0
            epoch_physics_loss = 0.0
            epoch_data_loss = 0.0
            
            # Mélange des données
            indices = torch.randperm(n_samples)
            
            for batch_idx in range(n_batches):
                # Sélection du batch
                start_idx = batch_idx * batch_size
                end_idx = min((batch_idx + 1) * batch_size, n_samples)
                batch_indices = indices[start_idx:end_idx]
                
                X_batch = X_train[batch_indices]
                y_batch = y_train[batch_indices].unsqueeze(1)
                
                # Réinitialisation des gradients
                self.optimizer.zero_grad()
                
                # Prédiction
                y_pred = self.model(X_batch)
                
                # Perte sur les données
                data_loss = nn.functional.mse_loss(y_pred, y_batch)
                
                # Perte physique
                physics_loss = self.model.physics_loss(
                    X_batch, y_pred,
                    self.conductivity, self.density, self.specific_heat
                )
                
                # Perte totale (pondérée)
                total_loss = data_loss + 0.1 * physics_loss
                
                # Rétropropagation
                total_loss.backward()
                self.optimizer.step()
                
                # Accumulation des pertes
                epoch_train_loss += total_loss.item()
                epoch_physics_loss += physics_loss.item()
                epoch_data_loss += data_loss.item()
            
            # Normalisation des pertes
            epoch_train_loss /= n_batches
            epoch_physics_loss /= n_batches
            epoch_data_loss /= n_batches
            
            # Validation
            val_loss = self._validate(X_val, y_val)
            
            # Historique
            history['train_loss'].append(epoch_train_loss)
            history['val_loss'].append(val_loss)
            history['physics_loss'].append(epoch_physics_loss)
            history['data_loss'].append(epoch_data_loss)
            
            # Mise à jour du score de fidélité
            self.fidelity_score = 1.0 / (1.0 + val_loss)
            
            # Logging
            if epoch % 10 == 0:
                logger.info(
                    f"Epoch {epoch}/{epochs} | "
                    f"Train Loss: {epoch_train_loss:.4e} | "
                    f"Val Loss: {val_loss:.4e} | "
                    f"Fidelity: {self.fidelity_score:.4f}"
                )
        
        self.training_history = history
        self.validation_loss = val_loss
        
        return history
    
    def _validate(self, X_val: torch.Tensor, y_val: torch.Tensor) -> float:
        """Validation du modèle"""
        self.model.eval()
        with torch.no_grad():
            y_pred = self.model(X_val)
            loss = nn.functional.mse_loss(y_pred, y_val.unsqueeze(1))
        self.model.train()
        return loss.item()
    
    def _apply_physical_constraints(self, predictions: torch.Tensor) -> torch.Tensor:
        """Application de contraintes physiques aux prédictions"""
        # Contrainte de positivité (température en Kelvin)
        predictions = torch.clamp(predictions, min=0.0)
        
        # Contrainte de continuité (filtre passe-bas)
        if predictions.shape[0] > 1:
            predictions = 0.5 * predictions + 0.5 * predictions.roll(1, 0)
        
        return predictions
    
    def update_learning_rate(self, new_lr: float):
        """Mise à jour du taux d'apprentissage"""
        self.learning_rate = new_lr
        for param_group in self.optimizer.param_groups:
            param_group['lr'] = new_lr
        
        logger.info(f"Taux d'apprentissage mis à jour: {new_lr}")
    
    def save_model(self, path: str):
        """Sauvegarde du modèle"""
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'config': self.config,
            'fidelity_score': self.fidelity_score,
            'training_history': self.training_history
        }, path)
        
        logger.info(f"Modèle sauvegardé: {path}")
    
    def load_model(self, path: str):
        """Chargement du modèle"""
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        self.fidelity_score = checkpoint['fidelity_score']
        self.training_history = checkpoint['training_history']
        
        logger.info(f"Modèle chargé: {path}")
    
    def get_model_summary(self) -> Dict[str, Any]:
        """Résumé du modèle"""
        total_params = sum(p.numel() for p in self.model.parameters())
        trainable_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
        
        return {
            'total_parameters': total_params,
            'trainable_parameters': trainable_params,
            'fidelity_score': self.fidelity_score,
            'validation_loss': self.validation_loss,
            'learning_rate': self.learning_rate,
            'device': str(self.device)
        }

# Exemple d'utilisation
if __name__ == "__main__":
    # Configuration
    config = {
        "hidden_layers": [64, 128, 64],
        "learning_rate": 1e-3,
        "batch_size": 32
    }
    
    # Initialisation du modèle
    pinn = PINNSurrogate(config)
    
    # Génération de données synthétiques
    n_samples = 1000
    geometry = np.random.randn(n_samples, 3)
    temperature = np.random.uniform(20, 100, n_samples)
    
    # Split train/validation
    split_idx = int(0.8 * n_samples)
    train_data = {
        'geometry': geometry[:split_idx],
        'temperature': temperature[:split_idx]
    }
    val_data = {
        'geometry': geometry[split_idx:],
        'temperature': temperature[split_idx:]
    }
    
    # Entraînement
    history = pinn.train(train_data, val_data, epochs=50)
    
    # Prédiction
    predictions = pinn.predict(geometry)
    
    print(f"Score de fidélité: {pinn.fidelity_score:.4f}")
    print(f"Résumé du modèle: {pinn.get_model_summary()}")
