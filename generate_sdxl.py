import torch
from diffusers import StableDiffusionXLPipeline
import os

print("Loading SDXL model...")
pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float32,
    safety_checker=None,
)

pipe.to("cpu")
pipe.enable_attention_slicing()

prompts = [
    "a beautiful mountain sunset landscape with pine trees and a lake",
    "a portrait photo of a young woman with long hair smiling happily",
    "a snowy mountain range at night with stars and a bright full moon",
    "a breathtaking waterfall in a tropical rainforest with exotic birds",
    "an adorable kitten with bright blue eyes playing with yarn",
    "a handsome man with beard wearing a leather jacket confidently",
    "a stunning ocean beach at sunset with palm trees",
    "a green meadow with red flowers and a wooden barn",
    "a cozy library with thousands of books and fireplace",
    "a robotic humanoid face with metallic skin and glowing eyes",
    "an ancient castle on a cliff overlooking a misty valley",
    "a magical forest with glowing mushrooms and fairy lights",
    "a hidden waterfall inside a crystal cave with glowing crystals",
    "a dreamy cherry blossom garden with Japanese pavilion",
    "a futuristic city with flying cars and neon lights",
    "a phoenix rising from flames in dramatic sky",
    "floating islands with waterfalls falling into clouds",
    "a space station orbiting a ringed planet",
    "a cyberpunk street scene with holographic ads at night",
    "a mystical library with floating books and portals",
]

os.makedirs("public/ai-images", exist_ok=True)

for i, prompt in enumerate(prompts):
    print(f"Generating image {i+1}/20...")
    image = pipe(
        prompt=prompt,
        num_inference_steps=25,
        height=768,
        width=768,
        guidance_scale=7.5,
    ).images[0]
    
    image.save(f"public/ai-images/ai-{i}.jpg")
    print(f"  Saved ai-{i}.jpg ({image.size})")

print("Done!")
