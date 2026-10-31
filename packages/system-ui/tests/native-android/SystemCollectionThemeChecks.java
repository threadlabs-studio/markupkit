package studio.threadlabs.systemui.tests;

import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.ColorUtils;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.color.MaterialColors;
import org.json.JSONObject;
import studio.threadlabs.systemui.SystemCollection;

/** Native Material light/dark role mapping, retained rows and exact default restoration. */
public final class SystemCollectionThemeChecks {
    private static void check(boolean value,String message) {if(!value)throw new AssertionError(message);}
    private static MaterialButton row(View root) {return row(root,null);}
    private static MaterialButton row(View root,String label) {
        if(root instanceof MaterialButton button&&(label==null||button.getText().toString().contains(label)))return button;
        if(root instanceof ViewGroup group)for(int i=0;i<group.getChildCount();i++){MaterialButton found=row(group.getChildAt(i),label);if(found!=null)return found;}
        return null;
    }
    private static void accent(SystemCollection list,Integer seed) throws Exception {
        list.accent(seed);
    }
    public static int run(Context host,JSONObject fixtures) throws Exception {
        for(int scheme:new int[]{Configuration.UI_MODE_NIGHT_NO,Configuration.UI_MODE_NIGHT_YES}) {
            Configuration config=new Configuration(host.getResources().getConfiguration());
            config.uiMode=(config.uiMode&~Configuration.UI_MODE_NIGHT_MASK)|scheme;
            Context context=new android.view.ContextThemeWrapper(host.createConfigurationContext(config),com.google.android.material.R.style.Theme_Material3_DayNight_NoActionBar);
            SystemCollection list=new SystemCollection(context,intent -> {});
            list.render(fixtures.getJSONObject("ready"));
            MaterialButton first=row(list);ColorStateList nativeColors=first.getTextColors();
            int disabled=nativeColors.getColorForState(new int[]{-android.R.attr.state_enabled},nativeColors.getDefaultColor());
            int surface=MaterialColors.getColor(first,com.google.android.material.R.attr.colorSurface);
            for(int seed:new int[]{0xff16784a,0xffc44f28,0xffffffff,0xff000000}) {
                accent(list,seed);
                check(first.getCurrentTextColor()==MaterialColors.getColorRoles(context,seed).getAccent(),"Collection did not use the native Material text role");
                check(row(list,"Coast")==first,"Theme replaced a keyed native row");
                check(ColorUtils.calculateContrast(first.getCurrentTextColor(),surface)>=4.5,"Accent text lacks contrast against native surface");
                first.setEnabled(false);
                check(first.getCurrentTextColor()==disabled,"Theme replaced native disabled text");first.setEnabled(true);
                list.render(fixtures.getJSONObject("reordered"));
                check(ColorUtils.calculateContrast(row(list).getCurrentTextColor(),surface)>=4.5,"Reordered row lost semantic text role");
            }
            accent(list,null);
            check(first.getTextColors()==nativeColors,"System accent did not restore the exact native color list");
            list.render(fixtures.getJSONObject("empty"));accent(list,0xff16784a);
            list.render(fixtures.getJSONObject("ready"));
            check(row(list).getCurrentTextColor()==MaterialColors.getColorRoles(context,0xff16784a).getAccent(),"New rows lost active accent");
            check(ColorUtils.calculateContrast(row(list).getCurrentTextColor(),surface)>=4.5,"New row accent lacks native surface contrast");
            list.close();boolean refused=false;
            try {accent(list,null);}catch(IllegalStateException error){refused=true;}
            check(refused,"Closed collection accepted a theme mutation");
        }
        return 2;
    }
}
