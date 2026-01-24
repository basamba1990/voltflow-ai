module thermal_solver
    implicit none
    integer, parameter :: dp = kind(1.0d0)
    private
    public :: solve_heat_transfer, initialize_solver, cleanup_solver, export_to_vtk
    
    type, public :: SimulationConfig
        real(dp) :: conductivity
        real(dp) :: density
        real(dp) :: specific_heat
        real(dp) :: initial_temp
        real(dp) :: boundary_temp
        real(dp) :: heat_flux
        integer :: mesh_elements
        integer :: max_iterations
        real(dp) :: tolerance
        character(len=200) :: mesh_file
    end type SimulationConfig
    
    type, public :: SimulationResult
        real(dp), allocatable :: temperature_field(:)
        real(dp) :: max_temp
        real(dp) :: min_temp
        real(dp) :: avg_temp
        real(dp) :: heat_gradient
        real(dp) :: convergence_rate
        real(dp) :: uncertainty_score
        integer :: iterations
        real(dp) :: final_residual
    end type SimulationResult
    
    real(dp), parameter :: PI = 3.41592653589793_dp
    
contains
    
    subroutine initialize_solver()
        ! Initialisation des tables de propriétés matérielles
        print *, "Thermal Solver initialisé avec précision double"
    end subroutine initialize_solver

    subroutine cleanup_solver(result)
        type(SimulationResult), intent(inout) :: result
        if (allocated(result%temperature_field)) then
            deallocate(result%temperature_field)
        end if
    end subroutine cleanup_solver

    subroutine solve_heat_transfer(config, result, progress_callback)
        type(SimulationConfig), intent(in) :: config
        type(SimulationResult), intent(out) :: result
        interface
            subroutine progress_callback(progress, status)
                real, intent(in) :: progress
                character(len=*), intent(in) :: status
            end subroutine progress_callback
        end interface
        
        real(dp), allocatable :: A(:,:), b(:), x(:), x_old(:)
        real(dp) :: dt, alpha, residual, norm_factor
        integer :: i, j, k, n, iter
        real(dp) :: start_time, end_time, computational_time
        
        call cpu_time(start_time)
        
        n = config%mesh_elements
        allocate(A(n,n), b(n), x(n), x_old(n))
        
        ! Appel du callback de progression
        call progress_callback(0.1, "Initialisation des matrices FEM")
        
        ! Coefficients physiques
        alpha = config%conductivity / (config%density * config%specific_heat)
        dt = 0.1_dp  ! Pas de temps adaptatif
        
        ! Construction matrice de rigidité (éléments finis linéaires)
        A = 0._dp
        do i = 1, n-1
            A(i,i) = 1._dp + 2._dp * alpha * dt
            A(i,i+1) = -alpha * dt
            A(i+1,i) = -alpha * dt
        end do
        A(n,n) = 1._dp + 2._dp * alpha * dt
        
        ! Application des conditions aux limites
        b = config%initial_temp
        b(1) = config%boundary_temp  ! Condition Dirichlet à gauche
        b(n) = config%boundary_temp  ! Condition Dirichlet à droite
        
        ! Source de chaleur distribuée (sinusoïdale pour exemple)
        do i = 1, n
            b(i) = b(i) + config%heat_flux * sin(PI * real(i-1, dp) / real(n-1, dp))
        end do
        
        ! Initialisation de la solution
        x = config%initial_temp
        result%iterations = 0
        norm_factor = 1._dp / real(n, dp)
        
        call progress_callback(0.3, "Résolution de l'équation de la chaleur")
        
        ! Solveur Gauss-Seidel avec critère d'arrêt adaptatif
        do iter = 1, config%max_iterations
            x_old = x
            residual = 0._dp
            
            ! Itération Gauss-Seidel
            do i = 1, n
                x(i) = b(i)
                do j = 1, n
                    if (j /= i) then
                        x(i) = x(i) - A(i,j) * x(j)
                    end if
                end do
                x(i) = x(i) / A(i,i)
                residual = residual + abs(x(i) - x_old(i))
            end do
            
            residual = residual * norm_factor
            result%iterations = iter
            
            ! Mise à jour de la progression
            if (mod(iter, 100) == 0) then
                call progress_callback(0.3 + 0.6 * (real(iter) / real(config%max_iterations)), &
                                      "Calcul en cours...")
            end if
            
            ! Critère de convergence
            if (residual < config%tolerance) exit
        end do
        
        ! Stockage des résultats
        allocate(result%temperature_field(n))
        result%temperature_field = x
        result%max_temp = maxval(x)
        result%min_temp = minval(x)
        result%avg_temp = sum(x) / real(n, dp)
        result%heat_gradient = (result%max_temp - result%min_temp) / real(n, dp)
        result%convergence_rate = exp(-real(iter, dp) / 1000._dp)
        result%final_residual = residual
        result%uncertainty_score = calculate_uncertainty(x, config)
        
        ! Nettoyage de la mémoire
        deallocate(A, b, x, x_old)
        
        call cpu_time(end_time)
        computational_time = end_time - start_time
        
        call progress_callback(1.0, "Simulation terminée")
        
        print *, "Simulation terminée en", iter, "itérations"
        print *, "Temps de calcul:", computational_time, "secondes"
        print *, "Résidu final:", residual
        
    end subroutine solve_heat_transfer
    
    function calculate_uncertainty(temperature, config) result(uncertainty)
        real(dp), intent(in) :: temperature(:)
        type(SimulationConfig), intent(in) :: config
        real(dp) :: uncertainty, variance, mean, skewness
        integer :: n, i
        
        n = size(temperature)
        mean = sum(temperature) / real(n, dp)
        
        ! Calcul de la variance
        variance = 0._dp
        do i = 1, n
            variance = variance + (temperature(i) - mean)**2
        end do
        variance = variance / real(n-1, dp)
        
        ! Calcul du skewness (asymétrie)
        skewness = 0._dp
        do i = 1, n
            skewness = skewness + ((temperature(i) - mean)**3) / (variance**1.5)
        end do
        skewness = skewness / real(n, dp)
        
        ! Score d'incertitude composite
        uncertainty = 0._dp * (variance / (mean + 1.e-0_dp)) + &
                     0._dp * abs(skewness) + &
                     0._dp * (config%heat_flux / 1000._dp)
        
        uncertainty = min(1._dp, max(0._dp, uncertainty))
        
    end function calculate_uncertainty
    
    ! Fonctions auxiliaires
    subroutine export_to_vtk(temperature, filename)
        real(dp), intent(in) :: temperature(:)
        character(len=*), intent(in) :: filename
        integer :: n, i, unit
        
        n = size(temperature)
        open(newunit=unit, file=filename, status='replace')
        
        write(unit, *) '# vtk DataFile Version 3.0'
        write(unit, *) 'Temperature Field'
        write(unit, *) 'ASCII'
        write(unit, *) 'DATASET STRUCTURED_GRID'
        write(unit, *) 'DIMENSIONS', n, 1, 1
        write(unit, *) 'POINTS', n, 'float'
        
        do i = 1, n
            write(unit, *) real(i-1), 0.0, 0.0
        end do
        
        write(unit, *) 'POINT_DATA', n
        write(unit, *) 'SCALARS Temperature float 1'
        write(unit, *) 'LOOKUP_TABLE default'
        
        do i = 1, n
            write(unit, *) real(temperature(i))
        end do
        
        close(unit)
    end subroutine export_to_vtk
    
end module thermal_solver

! Programme principal de test
program test_thermal_solver
    use thermal_solver
    implicit none
    integer, parameter :: dp = kind(1.0d0)
    
    type(SimulationConfig) :: config
    type(SimulationResult) :: result
    integer :: i
    
    ! Configuration de test
    config%conductivity = 200._dp
    config%density = 2700._dp
    config%specific_heat = 900._dp
    config%initial_temp = 25._dp
    config%boundary_temp = 100._dp
    config%heat_flux = 500._dp
    config%mesh_elements = 1000
    config%max_iterations = 15000
    config%tolerance = 1.e-_dp
    config%mesh_file = "mesh.vtk"
    
    call initialize_solver()
    call solve_heat_transfer(config, result, progress_callback)
    
    print *, "Température max:", result%max_temp
    print *, "Température min:", result%min_temp
    print *, "Score d'incertitude:", result%uncertainty_score
    
    ! Export des résultats
    call export_to_vtk(result%temperature_field, "temperature_field.vtk")
    
    call cleanup_solver(result)
    
contains
    
    subroutine progress_callback(progress, status)
        real, intent(in) :: progress
        character(len=*), intent(in) :: status
        print *, "Progression:", progress*100, "% - ", status
    end subroutine progress_callback
    
end program test_thermal_solver
