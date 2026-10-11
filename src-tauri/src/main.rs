// Windows 发布构建不额外出一个控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ezspclient_lib::run()
}
