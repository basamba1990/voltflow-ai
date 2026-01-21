module thermal_solver
    use, intrinsic :: iso_fortran_env, only: dp => real64
    implicit none
    private
    public :: solve_heat_transfer, initialize_solver, cleanup_solver
    
    type, public :: SimulationConfig
        real(dp) :: conductivity
        real(dp) :: density
        real(dp) :: specific_heat
        real(dp) :: initial_temp
        real(dp) :: boundary_temp
        real(dp) :: heat_flux
        integer :: mesh_elements
        character(len=100) :: mesh_file
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
    end type SimulationResult
    
contains
    
    subroutine initialize_solver()
        ! Initialization logic if needed
    end subroutine initialize_solver

    subroutine cleanup_solver(result)
        type(SimulationResult), intent(inout) :: result
        if (allocated(result%temperature_field)) deallocate(result%temperature_field)
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
        
        real(dp), allocatable :: A(:,:), b(:), x(:)
        real(dp) :: dt, alpha, residual
        integer :: i, n
        
        call progress_callback(0.1, "Initializing FEM matrices")
        
        n = config%mesh_elements
        allocate(A(n,n), b(n), x(n))
        
        ! Coefficients physiques
        alpha = config%conductivity / (config%density * config%specific_heat)
        dt = 0.01_dp  ! Pas de temps adaptatif
        
        ! Construction matrice rigidité (FEM)
        A = 0.0_dp
        do i = 1, n-1
            A(i,i) = 1.0_dp + 2.0_dp*alpha*dt
            A(i,i+1) = -alpha*dt
            A(i+1,i) = -alpha*dt
        end do
        A(n,n) = 1.0_dp + 2.0_dp*alpha*dt
        
        ! Vecteur source
        b = config%initial_temp
        b(1) = config%boundary_temp  ! Condition Dirichlet
        
        ! Solveur itératif (Gauss-Seidel)
        x = config%initial_temp
        result%iterations = 0
        
        call progress_callback(0.3, "Solving heat equation")
        
        do i = 1, 15000
            call gauss_seidel_iteration(A, x, b, residual)
            result%iterations = i
            
            if (mod(i, 100) == 0) then
                call progress_callback(0.3 + 0.6*(real(i)/15000.0), "Computing...")
            endif
            
            if (residual < 1.0e-6_dp) exit
        end do
        
        ! Stockage résultats
        allocate(result%temperature_field(n))
        result%temperature_field = x
        result%max_temp = maxval(x)
        result%min_temp = minval(x)
        result%avg_temp = sum(x)/n
        result%convergence_rate = exp(-real(i)/1000.0)
        result%uncertainty_score = calculate_uncertainty(x, config)
        
        deallocate(A, b, x)
        
        call progress_callback(1.0, "Simulation completed")
        
    contains
    
        subroutine gauss_seidel_iteration(A, x, b, residual)
            real(dp), intent(in) :: A(:,:), b(:)
            real(dp), intent(inout) :: x(:)
            real(dp), intent(out) :: residual
            real(dp) :: sum_val, old_x
            integer :: j, k, n_size
            
            n_size = size(x)
            residual = 0.0_dp
            
            do j = 1, n_size
                old_x = x(j)
                sum_val = 0.0_dp
                
                do k = 1, n_size
                    if (k /= j) then
                        sum_val = sum_val + A(j,k) * x(k)
                    end if
                end do
                
                x(j) = (b(j) - sum_val) / A(j,j)
                residual = residual + abs(x(j) - old_x)
            end do
            
            residual = residual / n_size
        end subroutine gauss_seidel_iteration
    
        function calculate_uncertainty(temps, config) result(uncertainty)
            real(dp), intent(in) :: temps(:)
            type(SimulationConfig), intent(in) :: config
            real(dp) :: uncertainty, variance, mean
            integer :: n_size
            
            n_size = size(temps)
            mean = sum(temps)/n_size
            variance = sum((temps - mean)**2)/(n_size-1)
            
            ! Score d'incertitude basé sur gradient et variance
            uncertainty = min(1.0_dp, 0.1_dp * variance/mean + &
                0.05_dp * (config%heat_flux/1000.0_dp))
        end function calculate_uncertainty
    end subroutine solve_heat_transfer
    
end module thermal_solver
