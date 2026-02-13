! ============================================================================
! THERMAL SOLVER FORTRAN - Version 2.0
! Solveur thermique industriel 1D/2D/3D
! Compatible avec l'API Python et l'interface web
! ============================================================================

module precision_mod
    implicit none
    integer, parameter :: dp = kind(1.0d0)
end module precision_mod

module thermal_solver_nd
    use precision_mod
    implicit none
    private
    public :: SimulationConfig, SimulationResult
    public :: initialize_solver, solve_heat_transfer_nd
    public :: export_to_vtk_nd, cleanup_solver
    public :: dp

    type :: SimulationConfig
        ! Propriétés matériau
        real(dp) :: conductivity    ! Conductivité thermique [W/m·K]
        real(dp) :: density         ! Densité [kg/m³]
        real(dp) :: specific_heat   ! Chaleur spécifique [J/kg·K]
        
        ! Conditions thermiques
        real(dp) :: initial_temp    ! Température initiale [°C]
        real(dp) :: boundary_temp   ! Température bord [°C]
        real(dp) :: heat_flux       ! Flux thermique [W/m²]
        
        ! Maillage ND
        integer :: nx, ny, nz       ! Dimensions maillage
        
        ! Paramètres solveur
        integer :: max_iterations   ! Nombre max d'itérations
        real(dp) :: dt              ! Pas de temps [s]
        real(dp) :: tolerance       ! Tolérance convergence
        
        ! Fichiers
        character(len=200) :: mesh_file    ! Fichier géométrie
        character(len=20) :: geometry_type ! '1d_rod', '2d_plate', '3d_complex'
        character(len=200) :: output_file  ! Fichier résultats VTK
    end type SimulationConfig

    type :: SimulationResult
        real(dp), allocatable :: T(:,:,:)  ! Champ température
        real(dp) :: max_temp               ! Température max [°C]
        real(dp) :: min_temp               ! Température min [°C]
        real(dp) :: avg_temp               ! Température moyenne [°C]
        real(dp) :: final_residual         ! Résidu final
        integer :: iterations              ! Itérations réalisées
        character(len=20) :: geometry_type ! Type géométrie
    end type SimulationResult

contains

! ----------------------------------------------------------------------
! Initialisation solveur
! ----------------------------------------------------------------------
subroutine initialize_solver()
    print *, "========================================"
    print *, "THERMAL SOLVER ND - Version 2.0"
    print *, "Solveur thermique industriel 1D/2D/3D"
    print *, "========================================"
end subroutine initialize_solver

! ----------------------------------------------------------------------
! Nettoyage mémoire
! ----------------------------------------------------------------------
subroutine cleanup_solver(result)
    type(SimulationResult), intent(inout) :: result
    if (allocated(result%T)) deallocate(result%T)
end subroutine cleanup_solver

! ----------------------------------------------------------------------
! Résolution équation de la chaleur ND - CORRIGÉE
! ----------------------------------------------------------------------
subroutine solve_heat_transfer_nd(cfg, result)
    type(SimulationConfig), intent(in) :: cfg
    type(SimulationResult), intent(out) :: result
    
    integer :: i, j, k, iter
    real(dp) :: alpha, dx, dy, dz, residual, laplacian
    real(dp), allocatable :: Tnew(:,:,:)
    
    ! Allocations dynamiques
    allocate(result%T(cfg%nx, cfg%ny, cfg%nz))
    allocate(Tnew(cfg%nx, cfg%ny, cfg%nz))
    
    ! Initialisation température
    result%T = cfg%initial_temp
    
    ! Conditions aux limites Dirichlet
    result%T(1,:,:) = cfg%boundary_temp
    result%T(cfg%nx,:,:) = cfg%boundary_temp
    
    if (cfg%ny > 1) then
        result%T(:,1,:) = cfg%boundary_temp
        result%T(:,cfg%ny,:) = cfg%boundary_temp
    end if
    
    if (cfg%nz > 1) then
        result%T(:,:,1) = cfg%boundary_temp
        result%T(:,:,cfg%nz) = cfg%boundary_temp
    end if
    
    ! Calcul diffusivité thermique
    alpha = cfg%conductivity / (cfg%density * cfg%specific_heat)
    
    ! Discrétisation spatiale
    dx = 1._dp / real(max(1, cfg%nx-1), dp)
    dy = 1._dp / real(max(1, cfg%ny-1), dp)
    dz = 1._dp / real(max(1, cfg%nz-1), dp)
    
    ! Boucle de résolution
    do iter = 1, cfg%max_iterations
        residual = 0._dp
        
        ! Schéma explicite ND - VERSION CORRIGÉE
        do k = 1, cfg%nz
            do j = 1, cfg%ny
                do i = 1, cfg%nx
                    ! Par défaut, garder la valeur actuelle (pour les bords)
                    Tnew(i,j,k) = result%T(i,j,k)
                    
                    ! Appliquer le schéma seulement aux points intérieurs
                    if (i > 1 .and. i < cfg%nx) then
                        ! Laplacien 1D (X)
                        laplacian = (result%T(i+1,j,k) - 2._dp*result%T(i,j,k) + result%T(i-1,j,k)) / (dx*dx)
                        
                        ! Terme en Y si ny > 1
                        if (cfg%ny > 1 .and. j > 1 .and. j < cfg%ny) then
                            laplacian = laplacian + (result%T(i,j+1,k) - 2._dp*result%T(i,j,k) + result%T(i,j-1,k)) / (dy*dy)
                        end if
                        
                        ! Terme en Z si nz > 1
                        if (cfg%nz > 1 .and. k > 1 .and. k < cfg%nz) then
                            laplacian = laplacian + (result%T(i,j,k+1) - 2._dp*result%T(i,j,k) + result%T(i,j,k-1)) / (dz*dz)
                        end if
                        
                        ! Mise à jour de la température
                        Tnew(i,j,k) = result%T(i,j,k) + alpha * cfg%dt * laplacian
                        
                        ! Mise à jour résidu
                        residual = residual + abs(Tnew(i,j,k) - result%T(i,j,k))
                    end if
                end do
            end do
        end do
        
        ! Copie nouvelle température
        result%T = Tnew
        
        ! Calcul résidu moyen
        residual = residual / real(max(1, (cfg%nx-2) * max(1, cfg%ny-2) * max(1, cfg%nz-2)), dp)
        
        ! Critère convergence
        if (residual < cfg%tolerance) exit
    end do
    
    ! Calcul statistiques
    result%max_temp = maxval(result%T)
    result%min_temp = minval(result%T)
    result%avg_temp = sum(result%T) / real(size(result%T), dp)
    result%final_residual = residual
    result%iterations = min(iter, cfg%max_iterations)
    result%geometry_type = cfg%geometry_type
    
    ! Nettoyage temporaire
    deallocate(Tnew)
    
    print *, "Solveur terminé:"
    print *, "  Itérations:    ", result%iterations
    print *, "  Résidu final:  ", result%final_residual
    print *, "  T_max:         ", result%max_temp, "°C"
    print *, "  T_min:         ", result%min_temp, "°C"
    print *, "  T_moy:         ", result%avg_temp, "°C"
    print *, "  Maillage:      ", cfg%nx, "x", cfg%ny, "x", cfg%nz
    
end subroutine solve_heat_transfer_nd

! ----------------------------------------------------------------------
! Export résultats VTK (ParaView compatible)
! ----------------------------------------------------------------------
subroutine export_to_vtk_nd(T, filename, geometry_type)
    real(dp), intent(in) :: T(:,:,:)
    character(len=*), intent(in) :: filename
    character(len=*), intent(in) :: geometry_type
    
    integer :: i, j, k, nx, ny, nz, unit, ios
    
    nx = size(T, 1)
    ny = size(T, 2)
    nz = size(T, 3)
    
    open(newunit=unit, file=trim(filename), status='replace', action='write', iostat=ios)
    if (ios /= 0) then
        print *, "Erreur création fichier VTK: ", trim(filename)
        return
    end if
    
    ! En-tête VTK
    write(unit, '(A)') '# vtk DataFile Version 3.0'
    write(unit, '(A)') 'Thermal Field - ' // trim(geometry_type)
    write(unit, '(A)') 'ASCII'
    write(unit, '(A)') 'DATASET STRUCTURED_POINTS'
    write(unit, '(A,3I6)') 'DIMENSIONS', nx, ny, nz
    write(unit, '(A)') 'ORIGIN 0 0 0'
    write(unit, '(A)') 'SPACING 1 1 1'
    write(unit, '(A,I10)') 'POINT_DATA', nx*ny*nz
    write(unit, '(A)') 'SCALARS Temperature float 1'
    write(unit, '(A)') 'LOOKUP_TABLE default'
    
    ! Données température
    do k = 1, nz
        do j = 1, ny
            do i = 1, nx
                write(unit, '(F10.4)') real(T(i,j,k))
            end do
        end do
    end do
    
    close(unit)
    print *, "Fichier VTK généré: ", trim(filename)
    
end subroutine export_to_vtk_nd

end module thermal_solver_nd

! ============================================================================
! PROGRAMME PRINCIPAL - STANDALONE AVEC INTERFACE SIMPLE
! ============================================================================

program thermal_solver
    use precision_mod
    use thermal_solver_nd
    implicit none
    
    type(SimulationConfig) :: cfg
    type(SimulationResult) :: res
    character(len=200) :: config_file
    integer :: io_status
    logical :: file_exists
    
    ! Définition des paramètres par défaut
    cfg%conductivity = 50._dp      ! Aluminium
    cfg%density = 2700._dp
    cfg%specific_heat = 900._dp
    cfg%initial_temp = 1000._dp
    cfg%boundary_temp = 25._dp
    cfg%heat_flux = 1000._dp
    cfg%nx = 100
    cfg%ny = 1
    cfg%nz = 1
    cfg%max_iterations = 5000
    cfg%dt = 0._dp
    cfg%tolerance = 1.e-_dp
    cfg%geometry_type = '1d_rod'
    cfg%output_file = 'thermal_results.vtk'
    
    ! Vérification des arguments en ligne de commande
    if (command_argument_count() > 0) then
        call get_command_argument(1, config_file)
        
        ! Lecture depuis fichier de configuration
        inquire(file=trim(config_file), exist=file_exists)
        if (file_exists) then
            open(unit=10, file=trim(config_file), status='old', action='read', iostat=io_status)
            if (io_status == 0) then
                read(10, *) cfg%conductivity
                read(10, *) cfg%density
                read(10, *) cfg%specific_heat
                read(10, *) cfg%initial_temp
                read(10, *) cfg%boundary_temp
                read(10, *) cfg%heat_flux
                read(10, *) cfg%nx, cfg%ny, cfg%nz
                read(10, *) cfg%max_iterations
                read(10, *) cfg%dt
                read(10, *) cfg%tolerance
                read(10, '(A)') cfg%geometry_type
                read(10, '(A)') cfg%output_file
                close(10)
                print *, "Configuration chargée depuis: ", trim(config_file)
            end if
        end if
    end if
    
    ! Initialisation
    call initialize_solver()
    
    ! Validation des paramètres
    if (cfg%nx < 2) cfg%nx = 2
    if (cfg%ny < 1) cfg%ny = 1
    if (cfg%nz < 1) cfg%nz = 1
    if (cfg%dt <= 0._dp) cfg%dt = 0._dp
    
    print *, "Configuration:"
    print *, "  Matériau:        ", cfg%conductivity, " W/m·K"
    print *, "  Géométrie:       ", trim(cfg%geometry_type)
    print *, "  Maillage:        ", cfg%nx, "x", cfg%ny, "x", cfg%nz
    print *, "  T_initial:       ", cfg%initial_temp, "°C"
    print *, "  T_boundary:      ", cfg%boundary_temp, "°C"
    print *, "  Flux:            ", cfg%heat_flux, " W/m²"
    
    ! Résolution
    print *, ""
    print *, "Démarrage du calcul..."
    call solve_heat_transfer_nd(cfg, res)
    
    ! Export VTK
    if (len_trim(cfg%output_file) > 0) then
        call export_to_vtk_nd(res%T, cfg%output_file, cfg%geometry_type)
    else
        call export_to_vtk_nd(res%T, 'thermal_results.vtk', cfg%geometry_type)
    end if
    
    ! Nettoyage
    call cleanup_solver(res)
    
    ! Sortie pour l'API
    print *, ""
    print *, "RÉSULTATS FINAUX:"
    print *, "{"
    print *, '  "success": true,'
    print *, '  "geometry_type": "' // trim(cfg%geometry_type) // '",'
    print *, '  "mesh_points": ', cfg%nx * cfg%ny * cfg%nz, ','
    print *, '  "iterations": ', res%iterations, ','
    print *, '  "final_residual": ', res%final_residual, ','
    print *, '  "temperature_stats": {'
    print *, '    "max": ', res%max_temp, ','
    print *, '    "min": ', res%min_temp, ','
    print *, '    "avg": ', res%avg_temp
    print *, '  },'
    print *, '  "output_file": "' // trim(cfg%output_file) // '"'
    print *, "}"
    
end program thermal_solver
