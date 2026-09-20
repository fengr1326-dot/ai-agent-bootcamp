import { describe,it,expect } from 'vitest';
import sharp from 'sharp';
import { preparePhoto } from '../apps/api/src/photo-processing';

describe('真实图片处理回归',()=>{
  it('JPEG 按方向校正、限制尺寸并移除 EXIF 和位置元数据',async()=>{
    const original=await sharp({create:{width:1600,height:800,channels:3,background:'#407050'}}).withMetadata({orientation:6}).withExif({IFD0:{Copyright:'test fixture'},IFD3:{GPSLatitudeRef:'N',GPSLatitude:'31/1 0/1 0/1'}}).jpeg().toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const sanitized=await preparePhoto(original),metadata=await sharp(sanitized).metadata();
    expect(metadata.format).toBe('jpeg');expect(metadata.width).toBe(640);expect(metadata.height).toBe(1280);expect(metadata.exif).toBeUndefined();expect(metadata.orientation).toBeUndefined();
  });
  it('PNG 可转换且小图不放大',async()=>{
    const original=await sharp({create:{width:32,height:16,channels:4,background:'#40705080'}}).png().toBuffer();
    const metadata=await sharp(await preparePhoto(original)).metadata();expect(metadata.width).toBe(32);expect(metadata.height).toBe(16);expect(metadata.format).toBe('jpeg');
  });
  it('SVG、伪装的 JPEG 和超大请求被拒绝',async()=>{
    await expect(preparePhoto(Buffer.from('<svg></svg>'))).rejects.toThrow('Only JPEG');
    await expect(preparePhoto(Buffer.from([255,216,255,0]))).rejects.toThrow();
    await expect(preparePhoto(Buffer.alloc(8*1024*1024+1))).rejects.toThrow('Image too large');
  });
});
