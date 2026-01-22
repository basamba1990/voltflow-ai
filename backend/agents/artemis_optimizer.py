import numpy as np
from enum import Enum
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
import logging
from datetime import datetime, timedelta
import json
from scipy import stats

logger = logging.getLogger(__name__)

class MutationType(Enum):
    ARCHITECTURE = "architecture"
    HYPERPARAMETERS = "hyperparameters"
    LOSS_WEIGHTS = "loss_weights"
    REGULARIZATION = "regularization"
    OPTIMIZATION_STRATEGY = "optimization_strategy"

@dataclass
class MutationRecord:
    timestamp: str
    mutation_type: str
    parameters_before: Dict[str, Any]
    parameters_after: Dict[str, Any]
    performance_impact: float
    uncertainty_reduction: float
    validation_score: float

@dataclass
class OptimizationConfig:
    population_size: int = 10
    generations: int = 20
    mutation_rate: float = 0.3
    crossover_rate: float = 0.7
    elite_size: int = 2
    uncertainty_threshold: float = 0.05
    exploration_weight: float = 0.3
    exploitation_weight: float = 0.7

class GeneticAlgorithm:
    """Algorithme génétique pour l'optimisation des hyperparamètres"""
    
    def __init__(self, config: OptimizationConfig):
        self.config = config
        self.population = []
        self.fitness_history = []
        self.best_individual = None
        self.best_fitness = -float('inf')
    
    def initialize_population(self, base_config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Initialise une population d'individus à partir d'une configuration de base"""
        population = []
        
        for _ in range(self.config.population_size):
            individual = base_config.copy()
            
            # Mutation des hyperparamètres
            if 'learning_rate' in individual:
                individual['learning_rate'] = np.random.uniform(1e-5, 1e-2)
            
            if 'hidden_layers' in individual:
                # Mutation de l'architecture
                n_layers = np.random.randint(2, 6)
                individual['hidden_layers'] = [
                    np.random.choice([32, 64, 128, 256]) 
                    for _ in range(n_layers)
                ]
            
            if 'batch_size' in individual:
                individual['batch_size'] = np.random.choice([16, 32, 64, 128])
            
            # Ajout de paramètres de régularisation
            individual['dropout_rate'] = np.random.uniform(0.0, 0.5)
            individual['weight_decay'] = np.random.uniform(0.0, 1e-4)
            
            population.append(individual)
        
        return population
    
    def evaluate_fitness(self, individual: Dict[str, Any], 
                        simulation_results: Dict[str, Any]) -> float:
        """Évalue la fitness d'un individu"""
        fitness = 0.0
        
        # Score basé sur la réduction d'incertitude
        if 'uncertainty_score' in simulation_results:
            uncertainty = simulation_results['uncertainty_score']
            fitness += (1.0 - uncertainty) * 0.4
        
        # Score basé sur la performance de convergence
        if 'convergence_rate' in simulation_results:
            convergence = simulation_results['convergence_rate']
            fitness += convergence * 0.3
        
        # Score basé sur l'efficacité computationnelle
        if 'iterations' in simulation_results:
            iterations = simulation_results['iterations']
            efficiency = 1.0 / (1.0 + np.log(iterations + 1))
            fitness += efficiency * 0.2
        
        # Pénalité pour la complexité du modèle
        if 'hidden_layers' in individual:
            complexity = len(individual['hidden_layers']) * 0.01
            fitness -= complexity
        
        return max(0.0, fitness)
    
    def selection(self, fitness_scores: List[float]) -> List[int]:
        """Sélection par tournoi"""
        selected_indices = []
        
        for _ in range(self.config.population_size - self.config.elite_size):
            # Tournoi de taille 3
            tournament_indices = np.random.choice(
                len(fitness_scores), 
                size=3, 
                replace=False
            )
            tournament_fitness = [fitness_scores[i] for i in tournament_indices]
            winner_idx = tournament_indices[np.argmax(tournament_fitness)]
            selected_indices.append(winner_idx)
        
        return selected_indices
    
    def crossover(self, parent1: Dict[str, Any], 
                  parent2: Dict[str, Any]) -> Dict[str, Any]:
        """Crossover uniforme"""
        if np.random.random() > self.config.crossover_rate:
            return parent1.copy() if np.random.random() > 0.5 else parent2.copy()
        
        child = {}
        
        for key in set(parent1.keys()) | set(parent2.keys()):
            if key in parent1 and key in parent2:
                if isinstance(parent1[key], list) and isinstance(parent2[key], list):
                    # Crossover pour les listes
                    min_len = min(len(parent1[key]), len(parent2[key]))
                    child_list = []
                    
                    for i in range(min_len):
                        if np.random.random() > 0.5:
                            child_list.append(parent1[key][i])
                        else:
                            child_list.append(parent2[key][i])
                    
                    # Ajout de nouveaux gènes si les longueurs diffèrent
                    if len(parent1[key]) > min_len:
                        child_list.extend(parent1[key][min_len:])
                    elif len(parent2[key]) > min_len:
                        child_list.extend(parent2[key][min_len:])
                    
                    child[key] = child_list
                
                elif isinstance(parent1[key], (int, float)) and \
                     isinstance(parent2[key], (int, float)):
                    # Crossover pour les nombres
                    alpha = np.random.random()
                    child[key] = alpha * parent1[key] + (1 - alpha) * parent2[key]
                
                else:
                    # Crossover discret
                    child[key] = parent1[key] if np.random.random() > 0.5 else parent2[key]
            elif key in parent1:
                child[key] = parent1[key]
            else:
                child[key] = parent2[key]
        
        return child
    
    def mutate(self, individual: Dict[str, Any]) -> Dict[str, Any]:
        """Mutation d'un individu"""
        mutated = individual.copy()
        
        for key in mutated:
            if np.random.random() < self.config.mutation_rate:
                if key == 'learning_rate':
                    # Mutation logarithmique
                    mutated[key] = 10 ** np.random.uniform(-5, -2)
                
                elif key == 'hidden_layers':
                    # Mutation de l'architecture
                    mutation_type = np.random.choice(['add', 'remove', 'modify'])
                    
                    if mutation_type == 'add' and len(mutated[key]) < 8:
                        mutated[key].insert(
                            np.random.randint(0, len(mutated[key])),
                            np.random.choice([32, 64, 128, 256])
                        )
                    
                    elif mutation_type == 'remove' and len(mutated[key]) > 2:
                        mutated[key].pop(np.random.randint(0, len(mutated[key])))
                    
                    elif mutation_type == 'modify':
                        idx = np.random.randint(0, len(mutated[key]))
                        mutated[key][idx] = np.random.choice([32, 64, 128, 256])
                
                elif key == 'batch_size':
                    mutated[key] = np.random.choice([8, 16, 32, 64, 128])
                
                elif key in ['dropout_rate', 'weight_decay']:
                    mutated[key] = np.random.uniform(0.0, 0.5 if key == 'dropout_rate' else 1e-3)
        
        return mutated
    
    def evolve(self, base_config: Dict[str, Any], 
               simulation_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Exécute une génération de l'algorithme génétique"""
        
        # Initialisation de la population
        if not self.population:
            self.population = self.initialize_population(base_config)
        
        # Évaluation de la fitness
        fitness_scores = []
        for individual in self.population:
            # Moyenne des résultats de simulation pour cet individu
            avg_results = self._aggregate_results(simulation_results)
            fitness = self.evaluate_fitness(individual, avg_results)
            fitness_scores.append(fitness)
        
        # Mise à jour du meilleur individu
        best_idx = np.argmax(fitness_scores)
        if fitness_scores[best_idx] > self.best_fitness:
            self.best_fitness = fitness_scores[best_idx]
            self.best_individual = self.population[best_idx].copy()
        
        self.fitness_history.append(np.mean(fitness_scores))
        
        # Sélection
        selected_indices = self.selection(fitness_scores)
        
        # Élitisme: conservation des meilleurs individus
        elite_indices = np.argsort(fitness_scores)[-self.config.elite_size:]
        new_population = [self.population[i].copy() for i in elite_indices]
        
        # Reproduction
        while len(new_population) < self.config.population_size:
            parent1_idx = np.random.choice(selected_indices)
            parent2_idx = np.random.choice(selected_indices)
            
            parent1 = self.population[parent1_idx]
            parent2 = self.population[parent2_idx]
            
            child = self.crossover(parent1, parent2)
            child = self.mutate(child)
            
            new_population.append(child)
        
        self.population = new_population
        
        return self.best_individual
    
    def _aggregate_results(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Agrège plusieurs résultats de simulation"""
        aggregated = {}
        
        for key in results[0].keys():
            values = [r[key] for r in results if key in r]
            
            if values:
                if isinstance(values[0], (int, float)):
                    aggregated[key] = np.mean(values)
                elif isinstance(values[0], list):
                    # Pour les listes, on prend la moyenne élément par élément
                    min_len = min(len(v) for v in values)
                    aggregated[key] = [
                        np.mean([v[i] for v in values if i < len(v)])
                        for i in range(min_len)
                    ]
        
        return aggregated

class ArtemisOptimizer:
    """
    Optimiseur ARTEMIS pour l'optimisation automatique des modèles PINN.
    Utilise des algorithmes génétiques et des stratégies d'exploration/exploitation.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        
        # Configuration de l'algorithme génétique
        ga_config = OptimizationConfig(
            population_size=self.config.get('population_size', 15),
            generations=self.config.get('generations', 25),
            mutation_rate=self.config.get('mutation_rate', 0.3),
            crossover_rate=self.config.get('crossover_rate', 0.7),
            uncertainty_threshold=self.config.get('uncertainty_threshold', 0.05)
        )
        
        self.genetic_algorithm = GeneticAlgorithm(ga_config)
        self.mutation_history: List[MutationRecord] = []
        self.optimization_stats = {
            'total_mutations': 0,
            'successful_mutations': 0,
            'uncertainty_reductions': [],
            'performance_improvements': []
        }
        
        # Cache pour éviter les évaluations redondantes
        self.evaluation_cache = {}
        self.last_optimization_time = None
        
        logger.info("Optimiseur ARTEMIS initialisé")
    
    async def optimize(self, 
                      simulation_results: Dict[str, Any], 
                      material_id: str,
                      current_config: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """
        Optimise les hyperparamètres du modèle PINN.
        
        Args:
            simulation_results: Résultats de la simulation
            material_id: Identifiant du matériau
            current_config: Configuration actuelle du modèle
            
        Returns:
            Configuration optimisée ou None si aucune optimisation nécessaire
        """
        
        uncertainty = simulation_results.get("uncertainty_score", 0)
        convergence_rate = simulation_results.get("convergence_rate", 0)
        
        # Vérification des conditions d'optimisation
        if not self._should_optimize(uncertainty, convergence_rate):
            logger.info("Conditions d'optimisation non remplies")
            return None
        
        logger.info(f"Déclenchement de l'optimisation ARTEMIS pour {material_id}")
        logger.info(f"Incertitude: {uncertainty:.4f}, Convergence: {convergence_rate:.4f}")
        
        # Configuration de base pour l'optimisation
        if current_config is None:
            current_config = {
                "learning_rate": 1e-3,
                "hidden_layers": [64, 128, 64],
                "batch_size": 32,
                "dropout_rate": 0.1,
                "weight_decay": 1e-5
            }
        
        # Exécution de l'algorithme génétique
        try:
            best_config = self.genetic_algorithm.evolve(
                current_config, 
                [simulation_results]
            )
            
            # Évaluation de l'amélioration
            improvement = self._evaluate_improvement(
                current_config, 
                best_config, 
                simulation_results
            )
            
            # Enregistrement de la mutation
            mutation_record = MutationRecord(
                timestamp=datetime.now().isoformat(),
                mutation_type=self._determine_mutation_type(current_config, best_config),
                parameters_before=current_config,
                parameters_after=best_config,
                performance_impact=improvement['performance_impact'],
                uncertainty_reduction=improvement['uncertainty_reduction'],
                validation_score=improvement['validation_score']
            )
            
            self.mutation_history.append(mutation_record)
            self._update_statistics(mutation_record)
            
            # Mise à jour du temps d'optimisation
            self.last_optimization_time = datetime.now()
            
            logger.info(f"Optimisation terminée. Amélioration: {improvement['performance_impact']:.2%}")
            
            return {
                "optimized_config": best_config,
                "mutation_record": asdict(mutation_record),
                "improvement_metrics": improvement,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Erreur lors de l'optimisation: {str(e)}")
            return None
    
    def _should_optimize(self, uncertainty: float, convergence_rate: float) -> bool:
        """Détermine si l'optimisation est nécessaire"""
        
        # Condition d'incertitude élevée
        uncertainty_condition = uncertainty > self.config.get('uncertainty_threshold', 0.05)
        
        # Condition de faible convergence
        convergence_condition = convergence_rate < 0.9
        
        # Condition temporelle (éviter les optimisations trop fréquentes)
        time_condition = True
        if self.last_optimization_time:
            time_since_last = datetime.now() - self.last_optimization_time
            time_condition = time_since_last > timedelta(minutes=30)
        
        # Condition de cache (éviter les optimisations redondantes)
        cache_key = f"{uncertainty:.4f}_{convergence_rate:.4f}"
        cache_condition = cache_key not in self.evaluation_cache
        
        return (uncertainty_condition or convergence_condition) and time_condition and cache_condition
    
    def _evaluate_improvement(self, 
                             before: Dict[str, Any], 
                             after: Dict[str, Any],
                             results: Dict[str, Any]) -> Dict[str, float]:
        """Évalue l'amélioration apportée par l'optimisation"""
        
        # Estimation de l'impact sur la performance
        performance_impact = 0.0
        
        if 'uncertainty_score' in results:
            # Réduction d'incertitude estimée
            uncertainty_reduction = min(0.3, results['uncertainty_score'] * 0.5)
            performance_impact += uncertainty_reduction * 0.6
        
        if 'convergence_rate' in results:
            # Amélioration de convergence estimée
            convergence_improvement = (1.0 - results['convergence_rate']) * 0.3
            performance_impact += convergence_improvement * 0.4
        
        # Score de validation basé sur la complexité
        validation_score = self._calculate_validation_score(after)
        
        return {
            'performance_impact': performance_impact,
            'uncertainty_reduction': performance_impact * 0.6,
            'validation_score': validation_score,
            'complexity_change': self._calculate_complexity_change(before, after)
        }
    
    def _calculate_validation_score(self, config: Dict[str, Any]) -> float:
        """Calcule un score de validation basé sur la configuration"""
        score = 1.0
        
        # Pénalité pour la complexité excessive
        if 'hidden_layers' in config:
            complexity = len(config['hidden_layers']) / 10.0
            score -= min(0.3, complexity)
        
        # Pénalité pour le taux d'apprentissage extrême
        if 'learning_rate' in config:
            lr = config['learning_rate']
            if lr < 1e-5 or lr > 1e-2:
                score -= 0.2
        
        return max(0.0, score)
    
    def _calculate_complexity_change(self, 
                                   before: Dict[str, Any], 
                                   after: Dict[str, Any]) -> float:
        """Calcule le changement de complexité"""
        complexity_before = self._estimate_complexity(before)
        complexity_after = self._estimate_complexity(after)
        
        return (complexity_after - complexity_before) / complexity_before
    
    def _estimate_complexity(self, config: Dict[str, Any]) -> float:
        """Estime la complexité d'une configuration"""
        complexity = 0.0
        
        if 'hidden_layers' in config:
            # Complexité basée sur le nombre de paramètres
            total_neurons = sum(config['hidden_layers'])
            complexity += total_neurons / 1000.0
        
        if 'learning_rate' in config:
            # Complexité basée sur la stabilité de l'apprentissage
            lr = config['learning_rate']
            if lr < 1e-4:
                complexity += 0.1  # Apprentissage lent
        
        return complexity
    
    def _determine_mutation_type(self, 
                                before: Dict[str, Any], 
                                after: Dict[str, Any]) -> str:
        """Détermine le type de mutation appliquée"""
        
        changes = []
        
        if 'hidden_layers' in before and 'hidden_layers' in after:
            if before['hidden_layers'] != after['hidden_layers']:
                changes.append('ARCHITECTURE')
        
        if 'learning_rate' in before and 'learning_rate' in after:
            if abs(before['learning_rate'] - after['learning_rate']) > 1e-6:
                changes.append('HYPERPARAMETERS')
        
        if 'dropout_rate' in after or 'weight_decay' in after:
            changes.append('REGULARIZATION')
        
        return changes[0] if changes else 'HYPERPARAMETERS'
    
    def _update_statistics(self, mutation_record: MutationRecord):
        """Met à jour les statistiques d'optimisation"""
        self.optimization_stats['total_mutations'] += 1
        
        if mutation_record.performance_impact > 0:
            self.optimization_stats['successful_mutations'] += 1
        
        self.optimization_stats['uncertainty_reductions'].append(
            mutation_record.uncertainty_reduction
        )
        self.optimization_stats['performance_improvements'].append(
            mutation_record.performance_impact
        )
    
    def get_optimization_summary(self) -> Dict[str, Any]:
        """Retourne un résumé des optimisations effectuées"""
        
        if not self.optimization_stats['performance_improvements']:
            return {
                'total_mutations': 0,
                'success_rate': 0.0,
                'avg_improvement': 0.0,
                'best_improvement': 0.0
            }
        
        improvements = self.optimization_stats['performance_improvements']
        
        return {
            'total_mutations': self.optimization_stats['total_mutations'],
            'successful_mutations': self.optimization_stats['successful_mutations'],
            'success_rate': (
                self.optimization_stats['successful_mutations'] / 
                self.optimization_stats['total_mutations']
            ),
            'avg_improvement': np.mean(improvements),
            'std_improvement': np.std(improvements),
            'best_improvement': np.max(improvements),
            'last_optimization': self.last_optimization_time.isoformat() 
                if self.last_optimization_time else None,
            'mutation_types': self._get_mutation_type_distribution()
        }
    
    def _get_mutation_type_distribution(self) -> Dict[str, int]:
        """Calcule la distribution des types de mutation"""
        distribution = {}
        
        for record in self.mutation_history:
            mutation_type = record.mutation_type
            distribution[mutation_type] = distribution.get(mutation_type, 0) + 1
        
        return distribution
    
    def export_history(self, filepath: str):
        """Exporte l'historique d'optimisation"""
        export_data = {
            'mutation_history': [asdict(record) for record in self.mutation_history],
            'optimization_stats': self.optimization_stats,
            'summary': self.get_optimization_summary(),
            'export_timestamp': datetime.now().isoformat()
        }
        
        with open(filepath, 'w') as f:
            json.dump(export_data, f, indent=2, default=str)
        
        logger.info(f"Historique exporté: {filepath}")
    
    def reset(self):
        """Réinitialise l'optimiseur"""
        self.mutation_history = []
        self.optimization_stats = {
            'total_mutations': 0,
            'successful_mutations': 0,
            'uncertainty_reductions': [],
            'performance_improvements': []
        }
        self.evaluation_cache = {}
        self.last_optimization_time = None
        
        logger.info("Optimiseur ARTEMIS réinitialisé")

# Exemple d'utilisation
if __name__ == "__main__":
    # Configuration de l'optimiseur
    artemis_config = {
        'population_size': 10,
        'generations': 15,
        'mutation_rate': 0.25,
        'uncertainty_threshold': 0.03
    }
    
    optimizer = ArtemisOptimizer(artemis_config)
    
    # Simulation de résultats
    simulation_results = {
        'uncertainty_score': 0.08,
        'convergence_rate': 0.85,
        'iterations': 12000,
        'temperature_field': list(np.random.uniform(20, 100, 1000))
    }
    
    # Configuration actuelle
    current_config = {
        'learning_rate': 1e-3,
        'hidden_layers': [64, 128, 64],
        'batch_size': 32
    }
    
    # Optimisation
    import asyncio
    
    async def test_optimization():
        result = await optimizer.optimize(
            simulation_results,
            'aluminum_6061',
            current_config
        )
        
        if result:
            print("Optimisation réussie!")
            print(f"Configuration optimisée: {result['optimized_config']}")
            print(f"Amélioration: {result['improvement_metrics']}")
            
            # Résumé
            summary = optimizer.get_optimization_summary()
            print(f"\nRésumé: {summary}")
            
            # Export de l'historique
            optimizer.export_history('artemis_history.json')
    
    asyncio.run(test_optimization())
