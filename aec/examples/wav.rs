/*
git submodule update --init
wget https://github.com/thewh1teagle/aec/releases/download/audio-files/rec.wav
wget https://github.com/thewh1teagle/aec/releases/download/audio-files/echo.wav
wget https://github.com/thewh1teagle/aec/releases/download/audio-files/voice.wav
cargo run --example wav rec.wav echo.wav output.wav
*/
use aec_rs::Aec;
use hound::{WavReader, WavWriter};

fn main() {
    // File paths for input and output
    let rec_path = std::env::args().nth(1).expect("Please specify rec path");
    let echo_path = std::env::args().nth(2).expect("Please specify echo path");
    let out_path = std::env::args().nth(3).expect("Please specify out path");

    // Read the WAV files
    let mut rec_reader = WavReader::open(rec_path).unwrap();
    let mut echo_reader = WavReader::open(echo_path).unwrap();

    // Get the WAV file specs (assuming both files have the same spec)
    let spec = rec_reader.spec();
    let mut out_writer = WavWriter::create(&out_path, spec).unwrap();

    let config = aec_rs::AecConfig {
        sample_rate: 16000,      // 16Khz (1s)
        filter_length: 1600,     // 0.1s
        frame_size: 160,         // 0.01s
        enable_preprocess: true, // Denoise as well
    };
    let aec = Aec::new(&config);

    // Initialize buffers with the frame size
    let mut rec_buffer = vec![0i16; config.frame_size];
    let mut echo_buffer = vec![0i16; config.frame_size];
    let mut out_buffer = vec![0i16; config.frame_size];

    // Read the entire WAV samples into Vec<i16>
    let rec_samples: Vec<i16> = rec_reader
        .samples::<i16>()
        .collect::<Result<_, _>>()
        .unwrap();
    let echo_samples: Vec<i16> = echo_reader
        .samples::<i16>()
        .collect::<Result<_, _>>()
        .unwrap();

    let num_samples = rec_samples.len().min(echo_samples.len());

    for i in 0..(num_samples / config.frame_size) {
        // Calculate the slice range for the current frame and copy it into the buffers
        rec_buffer
            .copy_from_slice(&rec_samples[i * config.frame_size..(i + 1) * config.frame_size]);
        echo_buffer
            .copy_from_slice(&echo_samples[i * config.frame_size..(i + 1) * config.frame_size]);
        // Apply echo cancellation
        aec.cancel_echo(&mut rec_buffer, &mut echo_buffer, &mut out_buffer);
        // Write the processed frame to the output file
        for &sample in &out_buffer {
            out_writer.write_sample(sample).unwrap();
        }
    }
    println!("Created {}", out_path);
}
