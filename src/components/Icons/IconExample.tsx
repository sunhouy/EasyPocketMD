import React from 'react';
import {
  ArrowCounterclockwise,
  ArrowClockwise,
  TypeBold,
  TypeItalic,
  TypeUnderline,
  TypeStrikethrough,
  TextLeft,
  TextCenter,
  TextRight,
  Justify,
} from './index';

interface IconExampleProps {
  size?: number;
  color?: string;
}

const IconExample: React.FC<IconExampleProps> = ({ size = 24, color = 'currentColor' }) => {
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '20px' }}>
      <div style={{ textAlign: 'center' }}>
        <ArrowCounterclockwise width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>撤销</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <ArrowClockwise width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>重做</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <TypeBold width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>粗体</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <TypeItalic width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>斜体</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <TypeUnderline width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>下划线</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <TypeStrikethrough width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>删除线</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <TextLeft width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>左对齐</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <TextCenter width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>居中对齐</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <TextRight width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>右对齐</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <Justify width={size} height={size} fill={color} />
        <div style={{ fontSize: '12px', marginTop: '4px' }}>两端对齐</div>
      </div>
    </div>
  );
};

export default IconExample;
