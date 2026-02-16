! ============================================================================
! THERMAL SOLVER FORTRAN - Version 2.5 (VOXEL MASK SUPPORT)
! Solveur thermique industriel 1D/2D/3D avec support de géométrie complexe
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
        real(dp) :: conductivity
        real(dp) :: density
        real(dp) :: specific_heat
        real(dp) :: initial_temp
        real(dp) :: boundary_temp
        real(dp) :: heat_flux
        integer :: nx, ny, nz
        integer :: max_iterations
        real(dp) :: dt
        real(dp) :: tolerance
        character(len=200) :: mesh_file
        character(len=20) :: geometry_type
        character(len=200) :: output_file
        logical :: use_mask
        character(len=200) :: mask_file
        integer, allocatable :: mask(:,:,:)
    end type SimulationConfig

    type :: SimulationResult
        real(dp), allocatable :: T(:,:,:)
        real(dp) :: max_temp
        real(dp) :: min_temp
        real(dp) :: avg_temp
        real(dp) :: final_residual
        integer :: iterations
        character(len=20) :: geometry_type
    end type SimulationResult

contains

subroutine initialize_solver()
    print *, "========================================"
    print *, "THERMAL SOLVER ND - Version 2.5"
    print *, "Support Voxel Mask pour STL"
    print *, "========================================"
end subroutine initialize_solver

subroutine cleanup_solver(result)
    type(SimulationResult), intent(inout) :: result
    if (allocated(result%T)) deallocate(result%T)
end subroutine cleanup_solver

subroutine solve_heat_transfer_nd(cfg, result)
    type(SimulationConfig), intent(in) :: cfg
    type(SimulationResult), intent(out) :: result
    integer :: i, j, k, iter
    real(dp) :: alpha, dx, dy, dz, residual, laplacian
    real(dp), allocatable :: Tnew(:,:,:)
    
    allocate(result%T(cfg%nx, cfg%ny, cfg%nz))
    allocate(Tnew(cfg%nx, cfg%ny, cfg%nz))
    result%T = cfg%initial_temp
    
    ! Conditions aux limites sur les bords du domaine
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
    
    alpha = cfg%conductivity / (cfg%density * cfg%specific_heat)
    dx = 1._dp / real(max(1, cfg%nx-1), dp)
    dy = 1._dp / real(max(1, cfg%ny-1), dp)
    dz = 1._dp / real(max(1, cfg%nz-1), dp)
    
    do iter = 1, cfg%max_iterations
        residual = 0._dp
        do k = 1, cfg%nz
            do j = 1, cfg%ny
                do i = 1, cfg%nx
                    Tnew(i,j,k) = result%T(i,j,k)
                    
                    ! Si on utilise un masque, on ignore les cellules extérieures
                    if (cfg%use_mask) then
                        if (cfg%mask(i,j,k) == 0) cycle
                    end if

                    if (i > 1 .and. i < cfg%nx) then
                        laplacian = (result%T(i+1,j,k) - 2._dp*result%T(i,j,k) + result%T(i-1,j,k)) / (dx*dx)
                        if (cfg%ny > 1 .and. j > 1 .and. j < cfg%ny) then
                            laplacian = laplacian + (result%T(i,j+1,k) - 2._dp*result%T(i,j,k) + result%T(i,j-1,k)) / (dy*dy)
                        end if
                        if (cfg%nz > 1 .and. k > 1 .and. k < cfg%nz) then
                            laplacian = laplacian + (result%T(i,j,k+1) - 2._dp*result%T(i,j,k) + result%T(i,j,k-1)) / (dz*dz)
                        end if
                        Tnew(i,j,k) = result%T(i,j,k) + alpha * cfg%dt * laplacian
                        residual = residual + abs(Tnew(i,j,k) - result%T(i,j,k))
                    end if
                end do
            end do
        end do
        result%T = Tnew
        residual = residual / real(max(1, (cfg%nx-2) * max(1, cfg%ny-2) * max(1, cfg%nz-2)), dp)
        if (residual < cfg%tolerance) exit
    end do
    
    result%max_temp = maxval(result%T)
    result%min_temp = minval(result%T)
    result%avg_temp = sum(result%T) / real(size(result%T), dp)
    result%final_residual = residual
    result%iterations = min(iter, cfg%max_iterations)
    result%geometry_type = cfg%geometry_type
    deallocate(Tnew)
end subroutine solve_heat_transfer_nd

subroutine export_to_vtk_nd(T, filename, geometry_type)
    real(dp), intent(in) :: T(:,:,:)
    character(len=*), intent(in) :: filename
    character(len=*), intent(in) :: geometry_type
    integer :: i, j, k, nx, ny, nz, unit, ios
    
    nx = size(T, 1); ny = size(T, 2); nz = size(T, 3)
    open(newunit=unit, file=trim(filename), status='replace', action='write', iostat=ios)
    if (ios /= 0) return
    
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
    
    do k = 1, nz
        do j = 1, ny
            do i = 1, nx
                write(unit, '(F10.4)') real(T(i,j,k))
            end do
        end do
    end do
    close(unit)
end subroutine export_to_vtk_nd

end module thermal_solver_nd

program thermal_solver
    use precision_mod
    use thermal_solver_nd
    implicit none
    
    type(SimulationConfig) :: cfg
    type(SimulationResult) :: res
    character(len=200) :: config_file
    integer :: io_status, mask_val
    logical :: file_exists
    integer :: i, j, k
    
    ! Valeurs par défaut
    cfg%use_mask = .false.
    
    if (command_argument_count() > 0) then
        call get_command_argument(1, config_file)
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
                
                ! Lecture du masque si présent
                read(10, *, iostat=io_status) mask_val
                if (io_status == 0 .and. mask_val == 1) then
                    cfg%use_mask = .true.
                    read(10, '(A)') cfg%mask_file
                    allocate(cfg%mask(cfg%nx, cfg%ny, cfg%nz))
                    ! Lecture simplifiée du masque (format texte pour robustesse)
                    open(unit=11, file=trim(cfg%mask_file), status='old', action='read')
                    do k = 1, cfg%nz
                        do j = 1, cfg%ny
                            do i = 1, cfg%nx
                                read(11, *) cfg%mask(i,j,k)
                            end do
                        end do
                    end do
                    close(11)
                end if
                close(10)
            end if
        end if
    end if
    
    call initialize_solver()
    call solve_heat_transfer_nd(cfg, res)
    call export_to_vtk_nd(res%T, cfg%output_file, cfg%geometry_type)
    
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
    
    call cleanup_solver(res)
    if (allocated(cfg%mask)) deallocate(cfg%mask)
end program thermal_solver
