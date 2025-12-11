/*
git submodule update --init
cargo run --example usage
*/

fn main() {
    let config = aec_rs::AecConfig {
        sample_rate: 16000,      // 16Khz (1s)
        filter_length: 1600,     // 0.1s
        frame_size: 160,         // 0.01s
        enable_preprocess: true, // Denoise as well
    };
    let aec = aec_rs::Aec::new(&config);

    let mut input_frame: Vec<i16> = vec![0; config.frame_size];
    let mut reference_frame: Vec<i16> = vec![0; config.frame_size];

    for i in 0..config.frame_size {
        input_frame[i] = (i % 10) as i16; // Sample data
        reference_frame[i] = (i % 5) as i16; // Simulated echo
    }

    // Process the frames with the AEC system
    let mut out_buffer = vec![0i16; config.frame_size];
    aec.cancel_echo(&mut input_frame, &mut reference_frame, &mut out_buffer);
    println!("Buffer has {} samples", out_buffer.len());
}
