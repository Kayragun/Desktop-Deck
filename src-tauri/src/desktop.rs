use core::ffi::c_void;

extern "system" {
    fn FindWindowA(class_name: *const u8, window_name: *const u8) -> *mut c_void;
    fn FindWindowExA(
        hwnd_parent: *mut c_void,
        hwnd_child_after: *mut c_void,
        class_name: *const u8,
        window_name: *const u8,
    ) -> *mut c_void;
    fn SendMessageTimeoutA(
        hwnd: *mut c_void,
        msg: u32,
        wp: usize,
        lp: isize,
        flags: u32,
        timeout: u32,
        result: *mut usize,
    ) -> isize;
    fn SetParent(h_wnd_child: *mut c_void, h_wnd_new_parent: *mut c_void) -> *mut c_void;
    fn EnumWindows(
        proc: unsafe extern "system" fn(*mut c_void, isize) -> i32,
        param: isize,
    ) -> i32;
    fn GetWindowLongPtrA(hwnd: *mut c_void, index: i32) -> isize;
    fn SetWindowLongPtrA(hwnd: *mut c_void, index: i32, new_long: isize) -> isize;
}

unsafe extern "system" fn find_worker_w(hwnd: *mut c_void, param: isize) -> i32 {
    let slot = &mut *(param as *mut *mut c_void);
    let def_view =
        FindWindowExA(hwnd, 0usize as _, b"SHELLDLL_DefView\0".as_ptr(), 0usize as _);
    if !def_view.is_null() {
        *slot = FindWindowExA(0usize as _, hwnd, b"WorkerW\0".as_ptr(), 0usize as _);
        return 0;
    }
    1
}

pub unsafe fn attach_to_desktop(hwnd: *mut c_void) {
    let progman = FindWindowA(b"Progman\0".as_ptr(), 0usize as _);
    if progman.is_null() {
        return;
    }
    let mut msg_result = 0usize;
    SendMessageTimeoutA(progman, 0x052C, 0, 0, 0, 1000, &mut msg_result);
    SendMessageTimeoutA(progman, 0x052C, 0xD, 0x01, 0, 1000, &mut msg_result);
    let mut worker_w: *mut c_void = 0usize as _;
    EnumWindows(find_worker_w, &mut worker_w as *mut *mut c_void as isize);
    let parent = if !worker_w.is_null() { worker_w } else { progman };
    SetParent(hwnd, parent);
    let ex = GetWindowLongPtrA(hwnd, -20);
    SetWindowLongPtrA(hwnd, -20, ex | 0x80); // WS_EX_TOOLWINDOW
}
